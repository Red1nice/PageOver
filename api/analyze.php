<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$action = $_GET['action'] ?? '';

const EXT_MAP = [
    ".js" => "JavaScript",
    ".ts" => "TypeScript",
    ".tsx" => "TypeScript (React)",
    ".jsx" => "JavaScript (React)",
    ".py" => "Python",
    ".php" => "PHP",
    ".java" => "Java",
    ".kt" => "Kotlin",
    ".cpp" => "C++",
    ".c" => "C",
    ".h" => "C/C++",
    ".cs" => "C#",
    ".go" => "Go",
    ".rs" => "Rust",
    ".swift" => "Swift",
    ".html" => "HTML",
    ".css" => "CSS",
    ".scss" => "SCSS",
    ".sql" => "SQL",
    ".rb" => "Ruby",
    ".sh" => "Shell",
];

const FRAMEWORK_MARKERS = [
    ["file" => "package.json", "name" => "React", "search" => '"react":'],
    ["file" => "package.json", "name" => "Vue", "search" => '"vue":'],
    ["file" => "package.json", "name" => "Angular", "search" => '"@angular/core":'],
    ["file" => "package.json", "name" => "Next.js", "search" => '"next":'],
    ["file" => "package.json", "name" => "Express", "search" => '"express":'],
    ["file" => "composer.json", "name" => "Laravel", "search" => '"laravel/framework":'],
    ["file" => "composer.json", "name" => "Symfony", "search" => '"symfony/symfony":'],
    ["file" => "requirements.txt", "name" => "Django", "search" => "Django"],
    ["file" => "requirements.txt", "name" => "Flask", "search" => "Flask"],
    ["file" => "Gemfile", "name" => "Rails", "search" => "rails"],
];

function analyzeFiles($files) {
    $languageCounts = [];
    $frameworksFound = [];
    $totalValidFiles = 0;

    foreach ($files as $file) {
        $pathInfo = pathinfo($file['name']);
        $ext = "." . ($pathInfo['extension'] ?? '');
        $ext = strtolower($ext);

        if (isset(EXT_MAP[$ext])) {
            $lang = EXT_MAP[$ext];
            $languageCounts[$lang] = ($languageCounts[$lang] ?? 0) + 1;
            $totalValidFiles++;
        }

        if (isset($file['content'])) {
            foreach (FRAMEWORK_MARKERS as $marker) {
                if (str_ends_with($file['name'], $marker['file']) && str_contains($file['content'], $marker['search'])) {
                    $frameworksFound[] = $marker['name'];
                }
            }
        }
    }

    $frameworksFound = array_unique($frameworksFound);
    $languagePercentages = [];
    if ($totalValidFiles > 0) {
        foreach ($languageCounts as $lang => $count) {
            $languagePercentages[$lang] = round(($count / $totalValidFiles) * 100);
        }
    }

    // Originality Score
    $uniqueLangs = count($languageCounts);
    $folderDepth = 0;
    foreach ($files as $f) {
        $depth = count(explode("/", $f['name']));
        if ($depth > $folderDepth) $folderDepth = $depth;
    }

    $score = $totalValidFiles > 0 
        ? min(100, ($uniqueLangs * 10) + ($folderDepth * 5) + ($totalValidFiles / 20))
        : 0;

    return [
        "languages" => $languagePercentages,
        "frameworks" => array_values($frameworksFound),
        "originalityScore" => (int)round($score),
        "fileCount" => $totalValidFiles
    ];
}

if ($action === 'zip') {
    if (!isset($_FILES['file'])) {
        echo json_encode(["error" => "No file uploaded"]);
        exit;
    }

    $zip = new ZipArchive;
    if ($zip->open($_FILES['file']['tmp_name']) === TRUE) {
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (str_ends_with($name, '/')) continue;
            
            $content = $zip->getFromIndex($i);
            $files[] = ["name" => $name, "content" => $content];
        }
        $zip->close();
        
        $analysis = analyzeFiles($files);
        echo json_encode(array_merge($analysis, [
            "projectName" => $_FILES['file']['name'],
            "source" => "zip"
        ]));
    } else {
        echo json_encode(["error" => "Failed to open ZIP"]);
    }
    exit;
}

if ($action === 'github') {
    $url = $input['url'] ?? '';
    if (!$url) {
        echo json_encode(["error" => "URL is required"]);
        exit;
    }

    $url = rtrim($url, '/');
    $parts = explode('/', $url);
    $repo = array_pop($parts);
    $owner = array_pop($parts);
    $repo = str_replace('.git', '', $repo);

    if (!$owner || !$repo) {
        echo json_encode(["error" => "Invalid GitHub URL"]);
        exit;
    }

    $token = getenv("GITHUB_TOKEN");
    $headers = [
        "Accept: application/vnd.github.v3+json",
        "User-Agent: PHP-Analyzer"
    ];
    if ($token) {
        $headers[] = "Authorization: Bearer $token";
    }

    $ctx = stream_context_create([
        "http" => [
            "method" => "GET",
            "header" => $headers,
            "ignore_errors" => true
        ]
    ]);

    // 1. Repo Info
    $repoDataJson = file_get_contents("https://api.github.com/repos/$owner/$repo", false, $ctx);
    $repoData = json_decode($repoDataJson, true);
    
    if (isset($repoData['message']) && !isset($repoData['id'])) {
        echo json_encode(["error" => "GitHub Error: " . $repoData['message']]);
        exit;
    }

    $defaultBranch = $repoData['default_branch'] ?? 'main';
    $isLive = !empty($repoData['homepage']);

    // 2. Recursive Tree
    $treeJson = file_get_contents("https://api.github.com/repos/$owner/$repo/git/trees/$defaultBranch?recursive=1", false, $ctx);
    $treeData = json_decode($treeJson, true);

    if (isset($treeData['message']) && !isset($treeData['tree'])) {
        echo json_encode(["error" => "Failed to fetch tree: " . $treeData['message']]);
        exit;
    }

    $tree = $treeData['tree'];
    $files = [];
    $markers = ["package.json", "composer.json", "requirements.txt", "Gemfile"];
    
    foreach ($tree as $node) {
        if ($node['type'] === 'blob') {
            $files[] = ["name" => $node['path']];
            
            // Check if it's a marker file and fetch content
            foreach ($markers as $marker) {
                if (str_ends_with($node['path'], $marker)) {
                    $contentJson = file_get_contents($node['url'], false, $ctx);
                    $contentData = json_decode($contentJson, true);
                    if (isset($contentData['content'])) {
                        $content = base64_decode($contentData['content']);
                        // Add or update content
                        $files[count($files)-1]['content'] = $content;
                    }
                }
            }
        }
    }

    $analysis = analyzeFiles($files);
    echo json_encode(array_merge($analysis, [
        "projectName" => $repo,
        "source" => "github",
        "isLive" => $isLive
    ]));
    exit;
}

echo json_encode(["error" => "Invalid Action"]);
