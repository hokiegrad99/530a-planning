const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Expose only the specific frontend asset folders
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Serve the index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback redirect to index
app.get('*', (req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Web server running locally at http://localhost:${PORT}`);
  console.log(`To connect other devices on your home network, use http://<your-local-ip>:${PORT}`);
});
