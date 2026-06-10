const fs = require('fs');

const content = fs.readFileSync('dify_workflow_temp.yml', 'utf8');

// I will just use regex to remove the nodes and edges, then append the end node text.
// Wait, regex might be tricky with yaml. Let's just use JSON stringify/parse? No, YAML parser in JS needs npm install.
