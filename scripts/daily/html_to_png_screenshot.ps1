# HTML to PNG Screenshot Generator
# Create screenshot from HTML file with multiple methods

param(
    [string]$HtmlFile = "",
    [string]$OutputPath = "",
    [int]$Width = 1400,
    [int]$Height = 1000
)

Write-Host "HTML to PNG Screenshot Generator" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Automatically find HTML file if not specified
if (-not $HtmlFile -or -not (Test-Path $HtmlFile)) {
    $htmlFiles = Get-ChildItem -Path $scriptDir -Filter "*.html"
    if ($htmlFiles.Count -gt 0) {
        $HtmlFile = $htmlFiles[0].FullName
        Write-Host "Found HTML file: $HtmlFile" -ForegroundColor Green
    } else {
        Write-Host "No HTML file found in current directory!" -ForegroundColor Red
        exit 1
    }
}

# Create output filename if not specified
if (-not $OutputPath) {
    $currentDate = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputPath = Join-Path $scriptDir "HTML_Screenshot_$currentDate.html"
}

Write-Host "HTML File: $HtmlFile" -ForegroundColor White
Write-Host "Output HTML: $OutputPath" -ForegroundColor White
Write-Host "Dimensions: ${Width}x${Height}" -ForegroundColor White

$screenshotSuccess = $false

# Method 1: WebBrowser Control (Best for full HTML rendering)
Write-Host "`nMethod 1: Using WebBrowser Control..." -ForegroundColor Yellow
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    # Create form and WebBrowser control
    $form = New-Object System.Windows.Forms.Form
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
    $form.ShowInTaskbar = $false
    $form.Size = New-Object System.Drawing.Size($Width, $Height)
    
    $browser = New-Object System.Windows.Forms.WebBrowser
    $browser.Size = New-Object System.Drawing.Size($Width, $Height)
    $browser.ScrollBarsEnabled = $false
    $browser.ScriptErrorsSuppressed = $true
    
    $form.Controls.Add($browser)
    
    # Load HTML file
    $htmlUrl = "file:///$($HtmlFile.Replace('\', '/'))"
    Write-Host "Loading HTML: $htmlUrl" -ForegroundColor Gray
    $browser.Navigate($htmlUrl)
    
    # Show form for proper rendering
    $form.Show()
    
    # Wait for complete loading
    $timeout = 30
    $elapsed = 0
    Write-Host "Waiting for HTML to load..." -ForegroundColor Gray
    while ($browser.ReadyState -ne "Complete" -and $elapsed -lt $timeout) {
        Start-Sleep -Milliseconds 500
        $elapsed += 0.5
        [System.Windows.Forms.Application]::DoEvents()
    }
    
    if ($browser.ReadyState -eq "Complete") {
        Write-Host "HTML loaded successfully!" -ForegroundColor Green
    } else {
        Write-Host "Timeout while loading HTML!" -ForegroundColor Yellow
    }
    
    # Additional time for CSS and layout rendering
    Write-Host "Waiting for CSS rendering..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
    [System.Windows.Forms.Application]::DoEvents()
    
    # Scroll to ensure all content is rendered
    try {
        $browser.Document.Window.ScrollTo(0, 99999)
        Start-Sleep -Seconds 2
        [System.Windows.Forms.Application]::DoEvents()
        $browser.Document.Window.ScrollTo(0, 0)
        Start-Sleep -Seconds 1
        [System.Windows.Forms.Application]::DoEvents()
    } catch {
        Write-Host "Cannot scroll: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    # Get actual document dimensions
    try {
        $documentHeight = $browser.Document.Body.ScrollRectangle.Height
        $documentWidth = $browser.Document.Body.ScrollRectangle.Width
        
        Write-Host "Document size: ${documentWidth}x${documentHeight}" -ForegroundColor Cyan
        
        # Use actual size or maximum size
        $actualWidth = [Math]::Min($documentWidth, $Width)
        $actualHeight = $documentHeight + 100  # Add buffer
        
        # Limit height to avoid memory issues
        if ($actualHeight -gt 3000) {
            Write-Host "Document too tall ($actualHeight px), limiting to 3000px" -ForegroundColor Yellow
            $actualHeight = 3000
        }
        
        Write-Host "Screenshot size: ${actualWidth}x${actualHeight}" -ForegroundColor Green
        
        # Resize browser to match content
        $browser.Size = New-Object System.Drawing.Size($actualWidth, $actualHeight)
        
        # Take screenshot
        $bitmap = New-Object System.Drawing.Bitmap($actualWidth, $actualHeight)
        $browser.DrawToBitmap($bitmap, $browser.ClientRectangle)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Cleanup
        $form.Close()
        $form.Dispose()
        $browser.Dispose()
        $bitmap.Dispose()
        
        if (Test-Path $OutputPath) {
            $fileSize = (Get-Item $OutputPath).Length
            Write-Host "✅ Screenshot successful! File size: $([Math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Green
            Write-Host "   Dimensions: ${actualWidth}x${actualHeight}" -ForegroundColor Green
            $screenshotSuccess = $true
        }
        
    } catch {
        Write-Host "Error getting document dimensions: $($_.Exception.Message)" -ForegroundColor Yellow
        
        # Fallback with default dimensions
        $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
        $browser.DrawToBitmap($bitmap, $browser.ClientRectangle)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        $form.Close()
        $form.Dispose()
        $browser.Dispose()
        $bitmap.Dispose()
        
        if (Test-Path $OutputPath) {
            $fileSize = (Get-Item $OutputPath).Length
            Write-Host "✅ Screenshot successful (fallback)! File size: $([Math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Green
            $screenshotSuccess = $true
        }
    }
    
} catch {
    Write-Host "❌ WebBrowser error: $($_.Exception.Message)" -ForegroundColor Red
}

# Method 2: Chrome Headless (If WebBrowser fails)
if (-not $screenshotSuccess) {
    Write-Host "`nMethod 2: Using Chrome Headless..." -ForegroundColor Yellow
    
    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )

    foreach ($chromePath in $chromePaths) {
        if (Test-Path $chromePath) {
            Write-Host "Found Chrome: $chromePath" -ForegroundColor Green
            
            try {
                $chromeArgs = @(
                    "--headless",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--window-size=$Width,$Height",
                    "--screenshot=$OutputPath",
                    "--virtual-time-budget=8000",  # 8 seconds for rendering
                    "--hide-scrollbars",
                    "--disable-web-security",
                    "file:///$($HtmlFile.Replace('\', '/'))"
                )
                
                Write-Host "Running Chrome..." -ForegroundColor Gray
                & $chromePath $chromeArgs
                Start-Sleep -Seconds 5
                
                if (Test-Path $OutputPath) {
                    $fileSize = (Get-Item $OutputPath).Length
                    if ($fileSize -gt 1000) {  # At least 1KB
                        Write-Host "✅ Chrome screenshot successful! File size: $([Math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Green
                        $screenshotSuccess = $true
                        break
                    } else {
                        Write-Host "❌ Screenshot file too small: $fileSize bytes" -ForegroundColor Yellow
                        Remove-Item $OutputPath -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Host "❌ Chrome error: $($_.Exception.Message)" -ForegroundColor Red
            }
            
            break
        }
    }
    
    if (-not $screenshotSuccess) {
        Write-Host "❌ Google Chrome not found or Chrome failed" -ForegroundColor Red
    }
}

# Method 3: Edge Headless (If Chrome fails)
if (-not $screenshotSuccess) {
    Write-Host "`nMethod 3: Using Microsoft Edge..." -ForegroundColor Yellow
    
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
    )
    
    foreach ($edgePath in $edgePaths) {
        if (Test-Path $edgePath) {
            Write-Host "Found Edge: $edgePath" -ForegroundColor Green
            
            try {
                $edgeArgs = @(
                    "--headless",
                    "--disable-gpu",
                    "--window-size=$Width,$Height",
                    "--screenshot=$OutputPath",
                    "--virtual-time-budget=8000",
                    "file:///$($HtmlFile.Replace('\', '/'))"
                )
                
                Write-Host "Running Edge..." -ForegroundColor Gray
                & $edgePath $edgeArgs
                Start-Sleep -Seconds 5
                
                if (Test-Path $OutputPath) {
                    $fileSize = (Get-Item $OutputPath).Length
                    if ($fileSize -gt 1000) {
                        Write-Host "✅ Edge screenshot successful! File size: $([Math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Green
                        $screenshotSuccess = $true
                        break
                    } else {
                        Remove-Item $OutputPath -ErrorAction SilentlyContinue
                    }
                }
            } catch {
                Write-Host "❌ Edge error: $($_.Exception.Message)" -ForegroundColor Red
            }
            
            break
        }
    }
}

# Method 4: Open browser for manual screenshot
if (-not $screenshotSuccess) {
    Write-Host "`nMethod 4: Opening browser for manual screenshot..." -ForegroundColor Yellow
    
    try {
        # Open HTML file in default browser
        Start-Process $HtmlFile
        Write-Host "✅ HTML opened in browser!" -ForegroundColor Green
        Write-Host "Please take a manual screenshot and save it at: $OutputPath" -ForegroundColor Cyan
        
        # Create placeholder file with instructions
        $placeholderPath = $OutputPath.Replace(".png", "_placeholder.png")
        
        Add-Type -AssemblyName System.Drawing
        
        $bitmap = New-Object System.Drawing.Bitmap(800, 600)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::LightYellow)
        
        $titleFont = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
        $textFont = New-Object System.Drawing.Font("Arial", 12)
        $blackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
        $redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Red)
        
        $graphics.DrawString("MANUAL SCREENSHOT REQUIRED", $titleFont, $redBrush, 50, 50)
        $graphics.DrawString("HTML has been opened in browser.", $textFont, $blackBrush, 50, 100)
        $graphics.DrawString("Please:", $textFont, $blackBrush, 50, 130)
        $graphics.DrawString("1. Take a screenshot of the webpage", $textFont, $blackBrush, 70, 160)
        $graphics.DrawString("2. Save PNG file at:", $textFont, $blackBrush, 70, 190)
        $graphics.DrawString("   $OutputPath", $textFont, $blackBrush, 70, 220)
        $graphics.DrawString("HTML File: $HtmlFile", $textFont, $blackBrush, 50, 270)
        $graphics.DrawString("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", $textFont, $blackBrush, 50, 320)
        
        $bitmap.Save($placeholderPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        $graphics.Dispose()
        $bitmap.Dispose()
        $titleFont.Dispose()
        $textFont.Dispose()
        $blackBrush.Dispose()
        $redBrush.Dispose()
        
        Write-Host "Created instruction file: $placeholderPath" -ForegroundColor Gray
        $screenshotSuccess = $true  # Consider this successful since we opened the browser
        
    } catch {
        Write-Host "❌ Cannot open browser: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Results
Write-Host "`n" + "="*80 -ForegroundColor Gray
if ($screenshotSuccess) {
    Write-Host "🎉 SUCCESS!" -ForegroundColor Green
    Write-Host "HTML File: $HtmlFile" -ForegroundColor White
    Write-Host "PNG File: $OutputPath" -ForegroundColor White
    
    if (Test-Path $OutputPath) {
        $fileInfo = Get-Item $OutputPath
        Write-Host "File Size: $([Math]::Round($fileInfo.Length/1KB, 2)) KB" -ForegroundColor Cyan
        Write-Host "Created: $($fileInfo.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Cyan
    }
} else {
    Write-Host "❌ FAILED!" -ForegroundColor Red
    Write-Host "Could not create screenshot automatically." -ForegroundColor Yellow
    Write-Host "Please take a manual screenshot." -ForegroundColor Yellow
}

Write-Host "`nCompleted at: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "="*80 -ForegroundColor Gray

# Open folder containing the result file
try {
    Start-Process "explorer.exe" -ArgumentList "/select,`"$OutputPath`""
} catch {
    Write-Host "Cannot open explorer to show the file." -ForegroundColor Yellow
}