import { readMemory } from '../../lib/memoryEngine';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const user_id = req.body?.user_id || req.query?.user_id;
    const key = req.body?.key || req.query?.key;
    
    if (!user_id || !key) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await readMemory(user_id, key);
    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
