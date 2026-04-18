import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ✅ req.user is available because protect middleware runs before upload
    const userId = req.user?._id?.toString();

    if (!userId) {
      return cb(new Error("Unauthorized - userId missing"));
    }

    // ✅ per-user folder
    const uploadPath = path.resolve(`uploads/${userId}`);
    fs.mkdirSync(uploadPath, { recursive: true }); // create if doesn't exist

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const unique = `${Date.now()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDFs allowed"));
    }
  },
});

export default upload;