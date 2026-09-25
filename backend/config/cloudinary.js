import { v2 as cloudinary } from 'cloudinary';

const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUD_NAME ||
  process.env.Cloud_name ||
  process.env.cloud_name;

const apiKey =
  process.env.CLOUDINARY_API_KEY ||
  process.env.API_KEY ||
  process.env.API_key ||
  process.env.api_key;

const apiSecret =
  process.env.CLOUDINARY_API_SECRET ||
  process.env.API_SECRET ||
  process.env.API_secret ||
  process.env.api_secret;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export default cloudinary;
