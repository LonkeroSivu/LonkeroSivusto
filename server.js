const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, "uploads/videos");
const usersFile = path.join(__dirname, "users.json");

// Luodaan tarvittavat kansiot ja tiedostot, jos niitä ei ole
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify({}));

// **Käyttäjänimen tallennus**
function saveUsername(userId, newUsername) {
    const users = JSON.parse(fs.readFileSync(usersFile));
    if (Object.values(users).includes(newUsername)) return false; // Tarkistetaan, onko nimi käytössä
    users[userId] = newUsername;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    return true;
}

// **Tiedoston tallennusasetukset**
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

// **Lataa video**
app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "Tiedoston lataus epäonnistui" });

    const filePath = `/videos/${req.file.filename}`;
    const videoData = {
        title: req.body.title || "Nimetön video",
        bio: req.body.bio || "Ei kuvausta",
        userId: req.body.userId,
        url: filePath
    };

    fs.writeFileSync(path.join(uploadDir, `${req.file.filename}.json`), JSON.stringify(videoData, null, 2));
    res.json({ success: true, filePath });
});

// **Hae videot**
app.get("/videos", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ success: false, message: "Virhe haettaessa videoita" });

        const videos = files.filter(file => file.endsWith(".mp4")).map(file => {
            const metaFile = path.join(uploadDir, file + ".json");
            let meta = { title: file, bio: "Ei kuvausta", userId: "Tuntematon" };

            if (fs.existsSync(metaFile)) {
                meta = JSON.parse(fs.readFileSync(metaFile));
            }

            return { ...meta, url: `/videos/${file}` };
        });

        res.json({ success: true, videos });
    });
});

// **Muokkaa videon tietoja**
app.put("/videos/:filename", (req, res) => {
    const filename = req.params.filename;
    const metaFile = path.join(uploadDir, filename + ".json");

    if (!fs.existsSync(metaFile)) return res.status(404).json({ success: false, message: "Videota ei löydy" });

    const updatedData = JSON.parse(fs.readFileSync(metaFile));
    updatedData.title = req.body.title || updatedData.title;
    updatedData.bio = req.body.bio || updatedData.bio;

    fs.writeFileSync(metaFile, JSON.stringify(updatedData, null, 2));
    res.json({ success: true, message: "Video päivitetty", video: updatedData });
});

// **Poista video**
app.delete("/videos/:filename", (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(uploadDir, filename);
    const metaPath = videoPath + ".json";

    if (!fs.existsSync(videoPath)) return res.status(404).json({ success: false, message: "Videota ei löydy" });

    fs.unlinkSync(videoPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    res.json({ success: true, message: "Video poistettu" });
});

// **Päivitä käyttäjänimi**
app.post("/update-username", (req, res) => {
    const { userId, newUsername } = req.body;
    if (!userId || !newUsername) return res.status(400).json({ success: false, message: "Virheelliset tiedot" });

    if (saveUsername(userId, newUsername)) {
        res.json({ success: true, message: "Käyttäjänimi päivitetty" });
    } else {
        res.status(400).json({ success: false, message: "Käyttäjänimi on jo käytössä!" });
    }
});

// **Poista videot automaattisesti joka viikko**
cron.schedule("0 0 * * 0", () => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return console.error("Virhe poistettaessa videoita:", err);
        files.forEach(file => fs.unlinkSync(path.join(uploadDir, file)));
        console.log("Kaikki videot poistettu automaattisesti!");
    });
});

app.use("/videos", express.static(uploadDir));

app.listen(PORT, () => console.log(`Palvelin käynnissä portissa ${PORT}`));
