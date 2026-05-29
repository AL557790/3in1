const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/download', async (req, res) => {
    const { url } = req.body;

    if (!url || !url.includes('tiktok.com')) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid TikTok URL' 
        });
    }

    try {
        const apiResponse = await axios.post('https://api.tikwm.com/api/', 
            new URLSearchParams({ url: url }),
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const data = apiResponse.data?.data;

        if (!data || !data.play) {
            throw new Error('API returned no video data');
        }

        res.json({
            success: true,
            title: data.title || 'TikTok Video',
            uploader: data.author?.nickname || data.author?.unique_id || 'Unknown',
            duration: data.duration ? `${data.duration}s` : '0:00',
            thumbnail: data.cover || '',
            views: data.play_count || 0,
            likes: data.digg_count || 0,
            downloadUrl: data.play,
            audioUrl: data.music || data.play,
            filename: `tiktok_${Date.now()}.mp4`
        });

    } catch (err) {
        console.error('API Error:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        }
        res.status(500).json({ 
            success: false, 
            error: 'Failed to extract video. Try another URL.' 
        });
    }
});

app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing URL');
    
    try {
        const response = await axios({
            method: 'get',
            url: decodeURIComponent(url),
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.tiktok.com/'
            }
        });
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        response.data.pipe(res);
    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(500).send('Download failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
