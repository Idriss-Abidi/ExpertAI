// Health check endpoint for Docker
export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'research-assistant-frontend' 
    });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
