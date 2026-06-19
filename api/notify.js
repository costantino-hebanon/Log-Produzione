// Vercel serverless — invia notifiche push via OneSignal
// ONESIGNAL_API_KEY va impostato come variabile d'ambiente su Vercel

const ONESIGNAL_APP_ID = 'XXXXX'; // TODO: inserisci il tuo OneSignal App ID

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ONESIGNAL_API_KEY non configurata' });

  const { heading, message, targetUsername } = req.body || {};
  if (!heading || !message) return res.status(400).json({ error: 'heading e message sono obbligatori' });

  const filters = targetUsername
    ? [{ field: 'tag', key: 'username', relation: '=', value: targetUsername }]
    : [{ field: 'tag', key: 'level', relation: '=', value: 'ufficio' }];

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        filters,
        headings: { it: heading, en: heading },
        contents: { it: message, en: message },
        url: '/',
      }),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
