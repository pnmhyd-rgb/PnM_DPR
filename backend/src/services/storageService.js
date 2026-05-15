const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const path = require('path')
const crypto = require('crypto')

const s3 = new S3Client({
  endpoint: `https://${process.env.DO_SPACES_REGION}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
})

const BUCKET = process.env.DO_SPACES_BUCKET

// Upload a base64-encoded file. Returns the Spaces key (path within bucket).
async function uploadFile(base64Data, originalName, mimeType, folder = 'compliance') {
  const ext = path.extname(originalName) || ''
  const key = `${folder}/${crypto.randomUUID()}${ext}`
  const buffer = Buffer.from(base64Data, 'base64')
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
    ACL: 'private',
  }))
  return key
}

// Generate a 15-minute signed download URL for a private Spaces file.
async function getSignedDownloadUrl(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn: 900 })
}

// Delete a file from Spaces by key. Safe to call with null/undefined.
async function deleteFile(key) {
  if (!key) return
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

module.exports = { uploadFile, getSignedDownloadUrl, deleteFile }
