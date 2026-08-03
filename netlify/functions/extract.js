exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { imageBase64 } = JSON.parse(event.body);
    
    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image data provided' }) };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_API_KEY not configured' }) };
    }

    const prompt = `Extract data from this JR Plastics certification form. Return ONLY valid JSON (no markdown).
Use these keys: po_number, pallet_number, railcar_number, date, pieces, packer, operator, t1-t20, length, width, surface_finish, qc_date, upf_receiver, recv_date, recv_time.
Use empty string for missing values. Return ONLY JSON.`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.6-27b',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                { type: 'text', text: prompt }
              ]
            }]
          })
        });

        if (response.status === 429) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 8000)); continue; }
          throw new Error('Rate limited');
        }

        if (!response.ok) throw new Error(`API error ${response.status}`);

        const json = await response.json();
        let text = json.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('Empty response');

        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        try {
          return { statusCode: 200, body: JSON.stringify(JSON.parse(text)) };
        } catch (e) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            return { statusCode: 200, body: JSON.stringify(JSON.parse(match[0])) };
          }
          throw new Error('No JSON found');
        }
      } catch (error) {
        if (attempt < 2) { 
          await new Promise(r => setTimeout(r, error.message.includes('Rate') ? 8000 : 2000)); 
          continue; 
        }
        throw error;
      }
    }
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
