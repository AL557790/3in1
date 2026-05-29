const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/download', (req, res) => {
    const { url } = req.body;

    if (!url || !url.includes('tiktok.com')) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid TikTok URL' 
        });
    }

    const command = `yt-dlp -j --no-warnings --no-check-certificates "${url}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error || !stdout) {
            console.error('yt-dlp error:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to extract video. Check the URL.' 
            });
        }

        try {
            const info = JSON.parse(stdout);
            
            const videoFormat = info.formats?.find(f => 
                f.vcodec !== 'none' && f.acodec !== 'none' && f.format_note?.includes('watermark') === false
            ) || info.formats?.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || info.formats?.[0];

            const audioFormat = info.formats?.find(f => 
                f.acodec !== 'none' && f.vcodec === 'none'
            ) || info.formats?.[0];

            res.json({
                success: true,
                title: info.title || info.description || 'TikTok Video',
                uploader: info.uploader || info.channel || 'Unknown',
                duration: info.duration ? `${Math.floor(info.duration / 60)}:${(info.duration % 60).toString().padStart(2, '0')}` : '0:00',
                thumbnail: info.thumbnail || '',
                views: info.view_count || 0,
                likes: info.like_count || 0,
                downloadUrl: videoFormat?.url || '',
                audioUrl: audioFormat?.url || '',
                filename: `tiktok_${info.id || Date.now()}.mp4`
            });

        } catch (parseErr) {
            console.error('Parse error:', parseErr);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to parse video data' 
            });
        }
    });
});

app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing URL');
    
    try {
        const axios = require('axios');
        const response = await axios({
            method: 'get',
            url: decodeURIComponent(url),
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Download failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
