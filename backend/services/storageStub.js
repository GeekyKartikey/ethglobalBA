// backend/services/storageStub.js
async function uploadToFilecoinStub(json) {
  console.log("Uploading to Filecoin (stub):", json);
  return `bafy-mock-${Date.now()}`;
}

module.exports = { uploadToFilecoinStub };
