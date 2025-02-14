const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = 3000;
const uploadDir = path.join(__dirname, "uploads/videos");
const profilesFile = path.join(__dirname, "profiles.json");
const likesFile = path.join(__dirname, "likes.json");

// Varmista, että tiedostot ja kansiot ovat olemassa
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(profilesFile)) fs.writeFileSync(profilesFile, JSON.stringify({}));
if (!fs.existsSync(likesFile)) fs.writeFileSync(likesFile, JSON.stringify({}));

// Multer-asetukset videoille ja profiilikuville
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const userId = req.body.userId || "Anonymous";
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${userId}-${timestamp}${ext}`);
    }
});
const upload = multer({ storage });

app.use(express.static("public"));
app.use(express.json());
app.use(require("cors")());

// ✅ Lataa video
app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "Upload failed" });

    const filePath = `/videos/${req.file.filename}`;
    const uploadTime = Date.now();

    const videoData = {
        title: req.body.title || "Untitled",
        userId: req.body.userId,
        filename: req.file.filename,
        url: filePath,
        uploadTime,
        likes: 0,
        dislikes: 0
    };

    fs.writeFileSync(path.join(uploadDir, `${req.file.filename}.json`), JSON.stringify(videoData, null, 2));
    res.json({ success: true, filePath });
});

// ✅ Hae videot
app.get("/videos", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false });

        const videos = files.filter(file => file.endsWith(".mp4")).map(file => {
            const metaFile = path.join(uploadDir, file + ".json");
            let meta = { title: file, userId: "Unknown", likes: 0, dislikes: 0 };

            if (fs.existsSync(metaFile)) {
                meta = JSON.parse(fs.readFileSync(metaFile));
            }
            return { ...meta, url: `/videos/${file}` };
        });

        res.json({ success: true, videos });
    });
});

// ✅ Profiilin haku (paranneltu versio)
app.get("/profile/:userId", (req, res) => {
    const { userId } = req.params;
    const profiles = JSON.parse(fs.readFileSync(profilesFile));

    if (!profiles[userId]) {
        return res.status(404).json({ success: false, message: "Käyttäjää ei löydy" });
    }

    const userProfile = profiles[userId];

    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false });

        userProfile.videos = files
            .filter(file => file.startsWith(userId) && file.endsWith(".mp4"))
            .map(file => ({
                title: file.replace(".mp4", ""),
                url: `/videos/${file}`
            }));

        res.json({ success: true, ...userProfile });
    });
});

// ✅ Profiilin päivittäminen
app.post("/profile/:userId", upload.single("avatar"), (req, res) => {
    const { userId } = req.params;
    const { bio } = req.body;
    const profiles = JSON.parse(fs.readFileSync(profilesFile));

    profiles[userId] = {
        bio: bio || profiles[userId]?.bio || "No bio",
        avatar: req.file ? `/uploads/${req.file.filename}` : profiles[userId]?.avatar || "default.png"
    };

    fs.writeFileSync(profilesFile, JSON.stringify(profiles, null, 2));
    res.json({ success: true });
});

// ✅ Tykkäysjärjestelmä (like/dislike)
app.post("/video/:filename/vote", (req, res) => {
    const { filename } = req.params;
    const { userId, vote } = req.body;
    if (!["like", "dislike"].includes(vote)) return res.status(400).json({ success: false });

    const likesData = JSON.parse(fs.readFileSync(likesFile));
    if (!likesData[filename]) likesData[filename] = {};

    if (likesData[filename][userId] === vote) {
        delete likesData[filename][userId]; // Poista ääni jos jo annettu
    } else {
        likesData[filename][userId] = vote;
    }
    fs.writeFileSync(likesFile, JSON.stringify(likesData, null, 2));
    res.json({ success: true });
});

// ✅ Videoiden automaattinen poisto (168h kuluttua)
cron.schedule("0 * * * *", () => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return console.error("Virhe poistaessa videoita:", err);

        const now = Date.now();
        files.forEach(file => {
            if (file.endsWith(".json")) {
                const metaFile = path.join(uploadDir, file);
                const videoData = JSON.parse(fs.readFileSync(metaFile));
                if (now - videoData.uploadTime >= 168 * 60 * 60 * 1000) {
                    const videoPath = path.join(uploadDir, videoData.filename);
                    fs.unlinkSync(videoPath); // Poista video
                    fs.unlinkSync(metaFile); // Poista metatiedosto
                }
            }
        });
    });
});

// ✅ Palvelimen käynnistys
app.use("/videos", express.static(uploadDir));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
