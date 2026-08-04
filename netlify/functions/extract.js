exports.handler = async (event) => {
  console.log('Extract function called');
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const imageBase64 = body.imageBase64;
    
    if (!imageBase64) {
      console.error('No image data provided');
      return { statusCode: 400, body: JSON.stringify({ error: 'No image data provided' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('API Key check:', apiKey ? 'Present' : 'MISSING');
    
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY environment variable not set');
      return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }) };
    }

    const prompt = `You are extracting data from a JR Plastics supplier certification form.

CRITICAL INSTRUCTIONS FOR GAUGES:
- Top row contains 9 hand-written gauges labeled t1 through t9 (read LEFT TO RIGHT)
- Bottom row contains 10 hand-written gauges labeled t10 through t19 (read LEFT TO RIGHT)
- Each gauge is a decimal measurement (e.g., 0.125, 0.250, 1.500)
- Read numbers carefully, even if slightly unclear or smudged
- If a gauge is unreadable, leave the value as empty string ""
- Do NOT guess or estimate values

Extract ALL fields from the form:
- po_number: Purchase order number
- pallet_number: Pallet identification
- railcar_number: Railcar identification
- date: Date in YYYY-MM-DD format
- pieces: Number of pieces
- packer: Name/ID of packer
- operator: Name/ID of operator
- t1-t19: Thickness gauge readings (decimal format)
- length: Length measurement
- width: Width measurement
- surface_finish: Surface finish specification
- qc_date: QC date in YYYY-MM-DD format
- upf_receiver: UPF receiver
- recv_date: Receive date in YYYY-MM-DD format
- recv_time: Receive time in HH:MM format

Return ONLY a valid JSON object with these exact keys, using empty strings for any missing values:
{"po_number":"","pallet_number":"","railcar_number":"","date":"","pieces":"","packer":"","operator":"","t1":"","t2":"","t3":"","t4":"","t5":"","t6":"","t7":"","t8":"","t9":"","t10":"","t11":"","t12":"","t13":"","t14":"","t15":"","t16":"","t17":"","t18":"","t19":"","length":"","width":"","surface_finish":"","qc_date":"","upf_receiver":"","recv_date":"","recv_time":""}

Do not include any markdown, explanations, or additional text. Return ONLY the JSON object.`;

    const payload = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
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
            text: prompt
          }
        ]
      }]
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1}`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(payload),
          timeout: 30000
        });

        console.log(`Status: ${response.status}`);

        if (response.status === 429) {
          if (attempt < 2) {
            console.log('Rate limited, retrying...');
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          throw new Error('Rate limited after retries');
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error: ${response.status} - ${errorText.slice(0, 200)}`);
          throw new Error(`Anthropic API error ${response.status}`);
        }

        const json = await response.json();
        console.log('Got response from Anthropic');
        
        let text = json.content?.[0]?.text || '';

        if (!text) {
          console.error('Empty response text');
          throw new Error('Empty response from model');
        }

        console.log('Response length:', text.length);

        // Clean up response - remove markdown if present
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
          const result = JSON.parse(text);
          console.log('Successfully parsed JSON directly');
          return {
            statusCode: 200,
            body: JSON.stringify(result)
          };
        } catch (e) {
          console.log('Direct parse failed, attempting extraction');
          
          // Try to extract JSON object
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const result = JSON.parse(match[0]);
              console.log('Successfully parsed extracted JSON');
              return {
                statusCode: 200,
                body: JSON.stringify(result)
              };
            } catch (parseError) {
              console.error('Failed to parse extracted JSON:', parseError.message);
              throw new Error('Could not parse JSON response');
            }
          }
          
          console.error('No JSON object found in response');
          throw new Error('No valid JSON in response');
        }

      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to extract data after retries' })
    };

  } catch (error) {
    console.error('Function error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' })
    };
  }
};
