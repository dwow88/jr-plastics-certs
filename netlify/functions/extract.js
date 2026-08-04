// JR Plastics Certificate Processor - Anthropic Backend
// Updated: Anthropic Claude API Integration

exports.handler = async (event) => {
  console.log('Extract handler invoked');
  
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not found in environment');
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'ANTHROPIC_API_KEY not configured on server. Please set the environment variable in Netlify.' 
        })
      };
    }

    console.log('API key found, proceeding with extraction');

    const systemPrompt = `You are an expert at extracting data from JR Plastics supplier certification forms.
Your task is to carefully read all fields and return ONLY valid JSON with no additional text or markdown.`;

    const userPrompt = `Extract all data from this JR Plastics certification form.

CRITICAL - GAUGE EXTRACTION:
- Top row: 9 hand-written gauges (t1 through t9) - read LEFT TO RIGHT
- Bottom row: 10 hand-written gauges (t10 through t19) - read LEFT TO RIGHT
- Each gauge shows a decimal measurement (like 0.125, 0.250, 1.500)
- Read carefully, even if numbers are slightly unclear
- If unreadable, leave empty string ""

Extract these fields:
- po_number: Purchase order number
- pallet_number: Pallet ID
- railcar_number: Railcar ID  
- date: Date (YYYY-MM-DD format)
- pieces: Number of pieces
- packer: Packer name/ID
- operator: Operator name/ID
- t1 through t19: Thickness gauge readings (decimal)
- length: Length measurement
- width: Width measurement
- surface_finish: Surface finish type
- qc_date: QC date (YYYY-MM-DD)
- upf_receiver: UPF receiver
- recv_date: Receive date (YYYY-MM-DD)
- recv_time: Receive time (HH:MM)

Return ONLY this JSON structure, with empty strings for missing values:
{
  "po_number": "",
  "pallet_number": "",
  "railcar_number": "",
  "date": "",
  "pieces": "",
  "packer": "",
  "operator": "",
  "t1": "",
  "t2": "",
  "t3": "",
  "t4": "",
  "t5": "",
  "t6": "",
  "t7": "",
  "t8": "",
  "t9": "",
  "t10": "",
  "t11": "",
  "t12": "",
  "t13": "",
  "t14": "",
  "t15": "",
  "t16": "",
  "t17": "",
  "t18": "",
  "t19": "",
  "length": "",
  "width": "",
  "surface_finish": "",
  "qc_date": "",
  "upf_receiver": "",
  "recv_date": "",
  "recv_time": ""
}

Do not include any markdown formatting, explanations, or additional text. Return ONLY the JSON object.`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ]
    };

    console.log('Sending request to Anthropic API');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Anthropic API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Anthropic API error: ${response.status}` 
        })
      };
    }

    const responseData = await response.json();
    console.log('Got response from Anthropic');

    // Extract text from response
    let extractedText = '';
    if (responseData.content && responseData.content.length > 0) {
      extractedText = responseData.content[0].text || '';
    }

    if (!extractedText) {
      console.error('Empty response from Anthropic');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Empty response from Claude' })
      };
    }

    console.log('Response text length:', extractedText.length);

    // Clean up response
    let cleanText = extractedText.trim();
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
          error: 'Could not parse response as JSON',
          responsePreview: cleanText.slice(0, 200)
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
