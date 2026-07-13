# Export every manual HTML to PDF via headless Edge.
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$dir = (Resolve-Path "User Manuals").Path
Get-ChildItem "$dir\*.html" | ForEach-Object {
  $pdf = $_.FullName -replace '\.html$', '.pdf'
  $uri = ([uri]$_.FullName).AbsoluteUri
  & $edge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$pdf" $uri | Out-Null
  Start-Sleep -Seconds 3
}
Get-ChildItem "$dir\*.pdf" | ForEach-Object { "{0}  {1} KB" -f $_.Name, [math]::Round($_.Length/1KB) }
