import { overrideMemory } from '../../lib/memoryEngine';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { user_id, key, value } = req.body;
    if (!user_id || !key || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await overrideMemory(user_id, key, value);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
