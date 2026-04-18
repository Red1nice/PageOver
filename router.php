<?php
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// If it's an API call without .php, try to find the .php file
if (strpos($path, '/api/') === 0 && !str_ends_with($path, '.php')) {
    $phpFile = "." . $path . ".php";
    if (file_exists($phpFile)) {
        require $phpFile;
        exit;
    }
}

// Default behavior for other files
return false;
