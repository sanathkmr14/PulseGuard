import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Writes content to a file, ensuring the directory exists first
 * @param {string} filePath - Path to the file
 * @param {string|Buffer} content - Content to write
 * @param {object} options - fs.writeFileSync options
 * @returns {boolean} - Success status
 */
export function writeFile(filePath, content, options = {}) {
  try {
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    fs.writeFileSync(filePath, content, options);
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Reads content from a file
 * @param {string} filePath - Path to the file
 * @param {object} options - fs.readFileSync options
 * @returns {string|Buffer|null} - File content or null if error
 */
export function readFile(filePath, options = {}) {
  try {
    return fs.readFileSync(filePath, options);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Deletes a file
 * @param {string} filePath - Path to the file
 * @returns {boolean} - Success status
 */
export function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Appends content to a file, ensuring the directory exists first
 * @param {string} filePath - Path to the file
 * @param {string} content - Content to append
 * @returns {boolean} - Success status
 */
export function appendFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    ensureDirectoryExists(dir);
    fs.appendFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error(`Error appending to file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Test function to verify file writing works
 * @returns {object} - Test results
 */
export async function testFileWriting() {
  const testResults = {
    success: true,
    tests: []
  };

  const testDir = path.join(__dirname, '../test');
  const testFile = path.join(testDir, 'write-test.txt');
  const timestamp = Date.now();
  const testContent = `Test write at ${timestamp}`;

  try {
    // Test directory creation
    ensureDirectoryExists(testDir);
    testResults.tests.push({ name: 'Directory creation', success: true });

    // Test file write
    const writeSuccess = writeFile(testFile, testContent);
    testResults.tests.push({ name: 'File write', success: writeSuccess });

    if (writeSuccess) {
      // Test file read
      const content = readFile(testFile, { encoding: 'utf8' });
      const readSuccess = content === testContent;
      testResults.tests.push({ 
        name: 'File read verification', 
        success: readSuccess,
        details: readSuccess ? 'Content matches' : `Expected: "${testContent}", Got: "${content}"`
      });

      // Test file delete
      const deleteSuccess = deleteFile(testFile);
      testResults.tests.push({ name: 'File delete', success: deleteSuccess });
    }
  } catch (error) {
    testResults.success = false;
    testResults.tests.push({ name: 'Unexpected error', success: false, error: error.message });
  }

  return testResults;
}

export default {
  ensureDirectoryExists,
  writeFile,
  readFile,
  deleteFile,
  appendFile,
  testFileWriting
};

