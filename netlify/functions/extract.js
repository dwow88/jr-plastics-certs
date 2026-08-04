// JR Plastics Certificate Processor - Groq Backend
// Updated: Groq Qwen Vision Integration

exports.handler = async (event) => {
  console.log('Extract handler invoked for Groq');
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let imageBase64;
    try {
      const parsed = JSON.parse(event.body);
      imageBase64 = parsed.imageBase64;
    } catch (e) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No image data provided' })
      };
    }

    // Get API key from environment
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      console.error('GROQ_API_KEY not found in environment');
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'GROQ_API_KEY not configured on server. Please set the environment variable in Netlify.' 
        })
      };
    }

    console.log('Groq API key found, proceeding with extraction');

    const prompt = `Extract data from this JR Plastics certification form. Return ONLY valid JSON with no markdown or explanation.

CRITICAL - GAUGE EXTRACTION:
- Top row: 9 hand-written gauges (t1-t9), read LEFT TO RIGHT
- Bottom row: 10 hand-written gauges (t10-t19), read LEFT TO RIGHT
- Each gauge shows decimal measurements (0.125, 0.250, 1.500, etc)
- Read carefully, even if slightly unclear
- If unreadable, use empty string ""

Extract these fields:
po_number, pallet_number, railcar_number, date (YYYY-MM-DD), pieces, packer, operator,
t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18, t19,
length, width, surface_finish, qc_date (YYYY-MM-DD), upf_receiver, recv_date (YYYY-MM-DD), recv_time (HH:MM)

Return ONLY this JSON structure:
{"po_number":"","pallet_number":"","railcar_number":"","date":"","pieces":"","packer":"","operator":"","t1":"","t2":"","t3":"","t4":"","t5":"","t6":"","t7":"","t8":"","t9":"","t10":"","t11":"","t12":"","t13":"","t14":"","t15":"","t16":"","t17":"","t18":"","t19":"","length":"","width":"","surface_finish":"","qc_date":"","upf_receiver":"","recv_date":"","recv_time":""}`;

    const requestBody = {
      model: 'qwen/qwen3.6-27b',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    };

    console.log('Sending request to Groq API');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });

    console.log(`Groq API response status: ${response.status}`);

    if (response.status === 429) {
      console.error('Rate limited by Groq');
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Rate limited - please wait and try again. Consider upgrading your Groq plan.' 
        })
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Groq API error: ${response.status}` 
        })
      };
    }

    const responseData = await response.json();
    console.log('Got response from Groq');

    // Extract text from response
    let extractedText = '';
    if (responseData.choices && responseData.choices.length > 0) {
      extractedText = responseData.choices[0].message?.content || '';
    }

    if (!extractedText) {
      console.error('Empty response from Groq');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Empty response from Groq' })
      };
    }

    console.log('Response text length:', extractedText.length);

    // Clean up response
    let cleanText = extractedText.trim();
    cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
    cleanText = cleanText.replace(/```\s*$/i, '').trim();

    // Try to parse JSON
    let jsonResult;
    try {
      jsonResult = JSON.parse(cleanText);
      console.log('Successfully parsed JSON');
      return {
        statusCode: 200,
        body: JSON.stringify(jsonResult)
      };
    } catch (parseError) {
      console.log('Direct parse failed, trying to extract JSON object');
      
      // Try to find JSON object in response
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          jsonResult = JSON.parse(jsonMatch[0]);
          console.log('Successfully parsed extracted JSON');
          return {
            statusCode: 200,
            body: JSON.stringify(jsonResult)
          };
        } catch (innerError) {
          console.error('Failed to parse extracted JSON:', innerError.message);
        }
      }
      
      console.error('Could not extract valid JSON from response');
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Could not parse response as JSON'
        })
      };
    }

  } catch (error) {
    console.error('Function error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'Unknown error in extraction function'
      })
    };
  }
};
