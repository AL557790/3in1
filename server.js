const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function downloadYtDlp() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(YTDLP_PATH)) {
            console.log('yt-dlp already exists');
            return resolve();
        }

        console.log('Downloading yt-dlp...');
        const file = fs.createWriteStream(YTDLP_PATH);
        const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
        
        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, { headers: { 'User-Agent': 'Node.js' } }, (res2) => {
                    if (res2.statusCode !== 200) {
                        return reject(new Error(`Failed to download: ${res2.statusCode}`));
                    }
                    res2.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        fs.chmodSync(YTDLP_PATH, 0o755);
                        console.log('yt-dlp downloaded successfully');
                        resolve();
                    });
                }).on('error', reject);
            } else if (res.statusCode === 200) {
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    fs.chmodSync(YTDLP_PATH, 0o755);
                    console.log('yt-dlp downloaded successfully');
                    resolve();
                });
            } else {
                reject(new Error(`Failed to download: ${res.statusCode}`));
            }
        }).on('error', reject);
    });
}

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

    if (!fs.existsSync(YTDLP_PATH)) {
        return res.status(500).json({
            success: false,
            error: 'yt-dlp not ready yet. Refresh and try again in a few seconds.'
        });
    }

    const command = `"${YTDLP_PATH}" -j --no-warnings --no-check-certificates --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;

    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error || !stdout) {
            console.error('yt-dlp error:', error?.message || 'empty stdout');
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

downloadYtDlp().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to download yt-dlp:', err.message);
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} (yt-dlp missing)`);
    });
});
