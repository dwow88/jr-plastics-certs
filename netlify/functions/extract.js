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

    const apiKey = process.env.GROQ_API_KEY;
    console.log('API Key check:', apiKey ? 'Present' : 'MISSING');
    
    if (!apiKey) {
      console.error('GROQ_API_KEY environment variable not set');
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not configured on server' }) };
    }

    const prompt = `Extract data from JR Plastics certification form. Return ONLY JSON.
Top row: 9 gauges (t1-t9), bottom row: 10 gauges (t10-t19).
Read hand-written numbers LEFT TO RIGHT.
Use empty string for missing values.
Return ONLY:
{"po_number":"","pallet_number":"","railcar_number":"","date":"","pieces":"","packer":"","operator":"","t1":"","t2":"","t3":"","t4":"","t5":"","t6":"","t7":"","t8":"","t9":"","t10":"","t11":"","t12":"","t13":"","t14":"","t15":"","t16":"","t17":"","t18":"","t19":"","length":"","width":"","surface_finish":"","qc_date":"","upf_receiver":"","recv_date":"","recv_time":""}`;

    const payload = {
      model: 'qwen/qwen3.6-27b',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
          },
          { type: 'text', text: prompt }
        ]
      }]
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1}`);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload),
          timeout: 30000
        });

        console.log(`Status: ${response.status}`);

        if (response.status === 429) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 10000));
            continue;
          }
          throw new Error('Rate limited');
        }

        if (!response.ok) {
          throw new Error(`API error ${response.status}`);
        }

        const json = await response.json();
        let text = json.choices?.[0]?.message?.content || '';

        if (!text) throw new Error('Empty response');

        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
          return {
            statusCode: 200,
            body: JSON.stringify(JSON.parse(text))
          };
        } catch (e) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            return {
              statusCode: 200,
              body: JSON.stringify(JSON.parse(match[0]))
            };
          }
          throw new Error('No JSON found');
        }

      } catch (error) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed after retries' })
    };

  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
