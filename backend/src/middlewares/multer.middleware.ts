import multer from "multer";
import path from "path";
import { AppError } from "../utils/AppError.js"; // Adjust path if needed

// Configuration Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 11;

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

// Double validation: check the actual file extension too
const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  // 1. Check the mime type (what the browser claims the file is)
  const isMimeTypeValid = allowedMimeTypes.includes(file.mimetype);

  // 2. Check the extension (prevents users from renaming an .exe to .jpg)
  const ext = path.extname(file.originalname).toLowerCase();
  const isExtensionValid = allowedExtensions.includes(ext);

  if (isMimeTypeValid && isExtensionValid) {
    cb(null, true);
  } else {
    // 3. Use AppError so the global error handler formats this cleanly
    cb(
      new AppError(
        "Invalid file type. Only JPG, JPEG, PNG, and WEBP images are allowed.",
        400,
        "INVALID_FILE_TYPE"
      )
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

export default upload;