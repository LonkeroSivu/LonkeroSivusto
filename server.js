// Backend updates
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = 3000;
const uploadDir = path.join(__dirname, "uploads/videos");
const usersFile = path.join(__dirname, "users.json");
const profilesFile = path.join(__dirname, "profiles.json");
const likesFile = path.join(__dirname, "likes.json");

// Ensure necessary files exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify({}));
if (!fs.existsSync(profilesFile)) fs.writeFileSync(profilesFile, JSON.stringify({}));
if (!fs.existsSync(likesFile)) fs.writeFileSync(likesFile, JSON.stringify({}));

// Storage setup
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

// Upload video
app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "Upload failed" });

    const filePath = `/videos/${req.file.filename}`;
    const uploadTime = Date.now();
    
    const videoData = {
        title: req.body.title || "Untitled",
        bio: req.body.bio || "No description",
        userId: req.body.userId,
        url: filePath,
        uploadTime,
        likes: 0,
        dislikes: 0
    };

    fs.writeFileSync(path.join(uploadDir, `${req.file.filename}.json`), JSON.stringify(videoData, null, 2));
    res.json({ success: true, filePath });
});

// Get videos
app.get("/videos", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false });
        
        const videos = files.filter(file => file.endsWith(".mp4")).map(file => {
            const metaFile = path.join(uploadDir, file + ".json");
            let meta = { title: file, bio: "No description", userId: "Unknown", likes: 0, dislikes: 0 };

            if (fs.existsSync(metaFile)) {
                meta = JSON.parse(fs.readFileSync(metaFile));
            }
            return { ...meta, url: `/videos/${file}` };
        });
        res.json({ success: true, videos });
    });
});

// Like or Dislike
app.post("/video/:filename/vote", (req, res) => {
    const { filename } = req.params;
    const { userId, vote } = req.body;
    if (!["like", "dislike"].includes(vote)) return res.status(400).json({ success: false });

    const likesData = JSON.parse(fs.readFileSync(likesFile));
    if (!likesData[filename]) likesData[filename] = {};
    
    if (likesData[filename][userId] === vote) {
        delete likesData[filename][userId]; // Remove vote if toggled off
    } else {
        likesData[filename][userId] = vote;
    }
    fs.writeFileSync(likesFile, JSON.stringify(likesData, null, 2));
    res.json({ success: true });
});

// Get profile
app.get("/profile/:userId", (req, res) => {
    const { userId } = req.params;
    const profiles = JSON.parse(fs.readFileSync(profilesFile));
    res.json(profiles[userId] || { userId, bio: "No bio", avatar: "default.png", videos: [] });
});

// Update profile
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

// Auto-delete user videos after 168 hours
cron.schedule("0 * * * *", () => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return console.error("Error deleting videos:", err);
        
        const now = Date.now();
        files.forEach(file => {
            if (file.endsWith(".json")) {
                const metaFile = path.join(uploadDir, file);
                const videoData = JSON.parse(fs.readFileSync(metaFile));
                if (now - videoData.uploadTime >= 168 * 60 * 60 * 1000) {
                    fs.unlinkSync(metaFile.replace(".json", "")); // Delete video
                    fs.unlinkSync(metaFile); // Delete metadata
                }
            }
        });
    });
});

app.get("/profile/:userId", (req, res) => {
    const userId = req.params.userId;
    const users = JSON.parse(fs.readFileSync(usersFile));

    if (!users[userId]) {
        return res.status(404).json({ success: false, message: "Käyttäjää ei löydy" });
    }

    const userProfile = {
        userId,
        bio: users[userId].bio || "Ei kuvausta",
        avatar: users[userId].avatar || "default.png",
        videos: []
    };

    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false, message: "Virhe haettaessa videoita" });

        userProfile.videos = files
            .filter(file => file.startsWith(userId) && file.endsWith(".mp4"))
            .map(file => ({
                title: file.replace(".mp4", ""),
                url: `/videos/${file}`
            }));

        res.json({ success: true, ...userProfile });
    });
});

app.use("/videos", express.static(uploadDir));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
