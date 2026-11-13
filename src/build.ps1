# 霓虹协议 · 单文件打包脚本
# 把 index.html + style.css + *.js 内联成一个可以直接双击运行的 HTML。
# 用法（系统默认禁用脚本执行）：
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path (Split-Path -Parent $root) '.'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$html = Get-Content (Join-Path $root 'dev.html') -Raw -Encoding UTF8
$css = Get-Content (Join-Path $root 'style.css') -Raw -Encoding UTF8
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")

$files = @('core.js', 'cards.js', 'entities.js', 'boss.js', 'game.js')
foreach ($f in $files) {
    $js = Get-Content (Join-Path $root $f) -Raw -Encoding UTF8
    $needle = "<script src=`"$f`"></script>"
    if (-not $html.Contains($needle)) { throw "dev.html 中找不到脚本引用: $f" }
    $html = $html.Replace($needle, "<script>`n$js`n</script>")
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$target = Join-Path $outDir 'index.html'
[System.IO.File]::WriteAllText($target, $html, $utf8)

$size = [Math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host "已生成: $target  ($size KB)"