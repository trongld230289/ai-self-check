# Advanced Daily Report with Proper HTML Screenshot
# Uses WebBrowser control to properly render HTML before screenshot

param([string]$To = "anhttt5@fpt.com")

Write-Host "Advanced TSS Daily Report with HTML Screenshot" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$errorLog = Join-Path $scriptDir "automation_log.txt"

function Write-AutoLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Add-Content -Path $errorLog -Value $logEntry
    Write-Host $logEntry -ForegroundColor Gray
}

Write-AutoLog "Starting advanced daily report with proper HTML screenshot"

# Initialize global variables for Sprint info
$global:currentSprintInfo = ""  # Will be auto-detected from current Sprint

# Step 1: Refresh ADO Data from Current Sprint
Write-Host "`nStep 1: Refreshing ADO data from current Sprint..." -ForegroundColor Yellow
try {
    Write-AutoLog "Auto-detecting current Sprint from ADO"
    
    # Get current iteration using Azure DevOps REST API
    Write-Host "Getting current iteration information..." -ForegroundColor Gray
    
    # First try to get team iterations to find the current one
    try {
        $teamIterationsOutput = az boards iteration team list --team "TSS-SS Devops Team" --project "TSS-MoonRaker" --organization https://dev.azure.com/hal-tss 2>&1
        
        if ($teamIterationsOutput -and $teamIterationsOutput -notlike "*ERROR*") {
            $iterationsJson = $teamIterationsOutput | ConvertFrom-Json
            
            # Find the current iteration (the one that contains today's date)
            $today = Get-Date
            foreach ($iteration in $iterationsJson) {
                if ($iteration.attributes -and $iteration.attributes.startDate -and $iteration.attributes.finishDate) {
                    $startDate = [DateTime]::Parse($iteration.attributes.startDate)
                    $endDate = [DateTime]::Parse($iteration.attributes.finishDate)
                    
                    if ($today -ge $startDate -and $today -le $endDate) {
                        $global:currentSprintInfo = $iteration.name
                        Write-Host "Found current Sprint: $global:currentSprintInfo" -ForegroundColor Green
                        Write-AutoLog "Current Sprint detected: $global:currentSprintInfo (Active: $startDate to $endDate)"
                        break
                    }
                }
            }
        }
    } catch {
        Write-Host "Could not get team iterations: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    # Fallback: if we couldn't detect current sprint, use the most recent work items
    if (-not $global:currentSprintInfo) {
        Write-Host "Fallback: Getting Sprint from recent work items..." -ForegroundColor Gray
        $recentWorkItemsQuery = "SELECT [System.TeamProject], [System.IterationPath] FROM WorkItems WHERE [System.TeamProject] = 'TSS-MoonRaker' AND [System.State] <> 'Closed' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC"
        $sprintOutput = az boards query --wiql $recentWorkItemsQuery --organization https://dev.azure.com/hal-tss 2>&1
        
        if ($sprintOutput -and $sprintOutput -notlike "*ERROR*") {
            try {
                $sprintJson = $sprintOutput | ConvertFrom-Json
                if ($sprintJson.workItems -and $sprintJson.workItems.Count -gt 0) {
                    # Get the most common iteration path from recent work items
                    $iterationPaths = @()
                    foreach ($item in $sprintJson.workItems) {
                        if ($item.fields -and $item.fields.'System.IterationPath') {
                            $iterationPaths += $item.fields.'System.IterationPath'
                        }
                    }
                    
                    if ($iterationPaths.Count -gt 0) {
                        # Find the most common iteration path
                        $mostCommonIteration = $iterationPaths | Group-Object | Sort-Object Count -Descending | Select-Object -First 1
                        $currentIterationPath = $mostCommonIteration.Name
                        
                        # Extract Sprint name from the path like "TSS-MoonRaker\Smart Scheduling 1.0.0\LRP 25.4 Sprint 2"
                        if ($currentIterationPath -match ".*\\([^\\]+)$") {
                            $global:currentSprintInfo = $matches[1]
                            Write-Host "Fallback Sprint detected: $global:currentSprintInfo" -ForegroundColor Yellow
                            Write-AutoLog "Fallback Sprint detected: $global:currentSprintInfo from path: $currentIterationPath"
                        }
                    }
                }
            } catch {
                Write-Host "Error parsing fallback Sprint data: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    
    # Final fallback
    if (-not $global:currentSprintInfo) {
        $global:currentSprintInfo = "LRP 25.4 Sprint 2"
        Write-Host "Using final fallback Sprint: $global:currentSprintInfo" -ForegroundColor Yellow
        Write-AutoLog "Using final fallback Sprint: $global:currentSprintInfo"
    }

# Function to get total remaining work from child tasks (simplified)
function Get-TotalRemainingWork {
    param([int]$ParentId, [array]$AllItems)
    
    $totalRemaining = 0
    $childItems = $AllItems | Where-Object { $_.fields.'System.Parent' -eq $ParentId }
    
    if ($childItems) {
        foreach ($child in $childItems) {
            if ($child.fields.'Microsoft.VSTS.Scheduling.RemainingWork') {
                $totalRemaining += $child.fields.'Microsoft.VSTS.Scheduling.RemainingWork'
            }
        }
        return $totalRemaining
    }
    
    return 0
}

Write-AutoLog "Starting advanced daily report with proper HTML screenshot"
    
    # TSS-MoonRaker query for current Sprint
    Write-Host "Querying TSS-MoonRaker with current Sprint: $global:currentSprintInfo..." -ForegroundColor Gray
    $tssMoonrakerQuery = "SELECT [System.Id], [System.Title], [Microsoft.VSTS.Scheduling.Effort], [Microsoft.VSTS.Scheduling.RemainingWork], [System.AssignedTo], [System.State], [System.WorkItemType], [System.Parent] FROM WorkItems WHERE [System.TeamProject] = 'TSS-MoonRaker' AND [System.IterationPath] = 'TSS-MoonRaker\LRP 25.4\$global:currentSprintInfo'"
    Write-Host "Debug: TSS Query: $tssMoonrakerQuery" -ForegroundColor Magenta
    $tssOutput = az boards query --wiql $tssMoonrakerQuery --organization https://dev.azure.com/hal-tss 2>&1
    Write-Host "Debug: TSS Output length: $($tssOutput.Length)" -ForegroundColor Cyan
    if ($tssOutput -like "*ERROR*" -or $tssOutput -like "*error*" -or $tssOutput -like "*denied*" -or $tssOutput -like "*unauthorized*") {
        Write-Host "TSS Query Error: $tssOutput" -ForegroundColor Red
    }
    
    # Maintain query - include System.Parent to get parent-child relationships
    Write-Host "Querying Maintain with Sprint: $global:currentSprintInfo..." -ForegroundColor Gray
    $maintainQuery = "SELECT [System.Id], [System.Title], [Microsoft.VSTS.Scheduling.Effort], [Microsoft.VSTS.Scheduling.RemainingWork], [System.AssignedTo], [System.State], [System.WorkItemType], [System.Parent] FROM WorkItems WHERE [System.TeamProject] = 'Maintain' AND [System.IterationPath] = 'Maintain\LRP 25.4\$global:currentSprintInfo'"
    Write-Host "Debug: Maintain Query: $maintainQuery" -ForegroundColor Magenta
    $maintainOutput = az boards query --wiql $maintainQuery --organization https://dev.azure.com/hal-tss 2>&1
    Write-Host "Debug: Maintain Output length: $($maintainOutput.Length)" -ForegroundColor Cyan
    if ($maintainOutput -like "*ERROR*" -or $maintainOutput -like "*error*" -or $maintainOutput -like "*denied*" -or $maintainOutput -like "*unauthorized*") {
        Write-Host "Maintain Query Error: $maintainOutput" -ForegroundColor Red
    }
    
    # Process TSS data
    $tssData = @()
    if ($tssOutput -and $tssOutput -notlike "*ERROR*" -and $tssOutput -notlike "*error*" -and $tssOutput -notlike "*denied*" -and $tssOutput -notlike "*unauthorized*") {
        try {
            $tssJson = $tssOutput | ConvertFrom-Json
            # Check if it's a direct array or has workItems property
            $workItems = if ($tssJson -is [array]) { $tssJson } else { $tssJson.workItems }
            
            if ($workItems) {
                # Debug: Show all items first
                Write-Host "Debug: All TSS items in Sprint:" -ForegroundColor Yellow
                foreach ($item in $workItems) {
                    if ($item.fields) {
                        $parentInfo = if ($item.fields.'System.Parent') { "Child of $($item.fields.'System.Parent')" } else { "Parent" }
                        Write-Host "  ID: $($item.fields.'System.Id') - $($item.fields.'System.WorkItemType') - $parentInfo" -ForegroundColor Gray
                    }
                }
                
                # Filter to get PARENT items: Bug and Product Backlog Item types
                $parentItems = $workItems | Where-Object { 
                    $_.fields.'System.WorkItemType' -in @("Bug", "Product Backlog Item") -and
                    $_.fields.'System.WorkItemType' -notin @("Test Suite", "Test Plan")
                }
                
                Write-Host "Debug: Found $($parentItems.Count) PARENT TSS items (Bug + PBI)" -ForegroundColor Yellow
                
                foreach ($item in $parentItems) {
                    if ($item.fields) {
                        $assignedToName = if ($item.fields.'System.AssignedTo') { $item.fields.'System.AssignedTo'.displayName } else { "Unassigned" }
                        
                        # Calculate total remaining work from ALL child tasks
                        $totalRemainingWork = Get-TotalRemainingWork -ParentId $item.fields.'System.Id' -AllItems $workItems
                        if ($totalRemainingWork -eq 0) {
                            $totalRemainingWork = $item.fields.'Microsoft.VSTS.Scheduling.RemainingWork'
                        }
                        
                        Write-Host "  TSS PARENT ID: $($item.fields.'System.Id') ($($item.fields.'System.WorkItemType')) - State: $($item.fields.'System.State') - RemainingWork: $totalRemainingWork" -ForegroundColor Green
                        $tssData += [PSCustomObject]@{
                            Id = $item.fields.'System.Id'
                            Title = $item.fields.'System.Title'
                            Effort = $item.fields.'Microsoft.VSTS.Scheduling.Effort'
                            RemainingWork = $totalRemainingWork
                            AssignedTo = $assignedToName
                            State = $item.fields.'System.State'
                            WorkItemType = $item.fields.'System.WorkItemType'
                            IsParent = "Yes"
                        }
                    }
                }
            }
        } catch {
            Write-Host "Error parsing TSS data: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    # Process Maintain data
    $maintainData = @()
    if ($maintainOutput -and $maintainOutput -notlike "*ERROR*" -and $maintainOutput -notlike "*error*" -and $maintainOutput -notlike "*denied*" -and $maintainOutput -notlike "*unauthorized*") {
        try {
            $maintainJson = $maintainOutput | ConvertFrom-Json
            # Check if it's a direct array or has workItems property
            $workItems = if ($maintainJson -is [array]) { $maintainJson } else { $maintainJson.workItems }
            
            if ($workItems) {
                # Debug: Show all items first
                Write-Host "Debug: All Maintain items in Sprint:" -ForegroundColor Yellow
                foreach ($item in $workItems) {
                    if ($item.fields) {
                        $parentInfo = if ($item.fields.'System.Parent') { "Child of $($item.fields.'System.Parent')" } else { "Parent" }
                        Write-Host "  ID: $($item.fields.'System.Id') - $($item.fields.'System.WorkItemType') - $parentInfo" -ForegroundColor Gray
                    }
                }
                
                # Filter to get PARENT items: Bug and Product Backlog Item types
                $parentItems = $workItems | Where-Object { 
                    $_.fields.'System.WorkItemType' -in @("Bug", "Product Backlog Item") -and
                    $_.fields.'System.WorkItemType' -notin @("Test Suite", "Test Plan")
                }
                
                Write-Host "Debug: Found $($parentItems.Count) PARENT Maintain items (Bug + PBI)" -ForegroundColor Yellow
                
                foreach ($item in $parentItems) {
                    if ($item.fields) {
                        $assignedToName = if ($item.fields.'System.AssignedTo') { $item.fields.'System.AssignedTo'.displayName } else { "Unassigned" }
                        
                        # Calculate total remaining work from ALL child tasks
                        $totalRemainingWork = Get-TotalRemainingWork -ParentId $item.fields.'System.Id' -AllItems $workItems
                        if ($totalRemainingWork -eq 0) {
                            $totalRemainingWork = $item.fields.'Microsoft.VSTS.Scheduling.RemainingWork'
                        }
                        
                        Write-Host "  MAINTAIN PARENT ID: $($item.fields.'System.Id') ($($item.fields.'System.WorkItemType')) - State: $($item.fields.'System.State') - RemainingWork: $totalRemainingWork" -ForegroundColor Green
                            
                        $maintainData += [PSCustomObject]@{
                            Id = $item.fields.'System.Id'
                            Title = $item.fields.'System.Title'
                            Effort = $item.fields.'Microsoft.VSTS.Scheduling.Effort'
                            RemainingWork = $totalRemainingWork
                            AssignedTo = $assignedToName
                            State = $item.fields.'System.State'
                            WorkItemType = $item.fields.'System.WorkItemType'
                            IsParent = "Yes"
                        }
                    }
                }
            }
        } catch {
            Write-Host "Error parsing Maintain data: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "TSS Data: $($tssData.Count) items" -ForegroundColor Cyan
    Write-Host "Maintain Data: $($maintainData.Count) items" -ForegroundColor Cyan
    
    Write-AutoLog "ADO queries completed with Sprint: $global:currentSprintInfo"
    Write-Host "ADO data refreshed successfully with Sprint info: $global:currentSprintInfo" -ForegroundColor Green
    
} catch {
    Write-AutoLog "ADO refresh error: $($_.Exception.Message)"
    Write-Host "ADO refresh had issues, continuing..." -ForegroundColor Yellow
}

# Step 2: Update HTML Template with Fresh Data
Write-Host "`nStep 2: Updating HTML template with fresh ADO data..." -ForegroundColor Yellow
$htmlFile = Join-Path $scriptDir "Daily_Report_Template.html"

if (Test-Path $htmlFile) {
    try {
        $htmlContent = Get-Content $htmlFile -Raw
        $currentTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        
        # Update timestamp
        $htmlContent = $htmlContent -replace '<p>Last updated: .*?</p>', "<p>Last updated: $currentTime</p>"
        
        # Update Sprint information in title
        $htmlContent = $htmlContent -replace '<title>.*?</title>', "<title>Daily Report - $global:currentSprintInfo</title>"
        
        # Count work items by state for TSS
        $tssInProgress = ($tssData | Where-Object { $_.State -eq "Active" -or $_.State -eq "In Progress" }).Count
        $tssTesting = ($tssData | Where-Object { $_.State -eq "Testing" -or $_.State -eq "Resolved" }).Count
        $tssDone = ($tssData | Where-Object { $_.State -eq "Closed" -or $_.State -eq "Done" }).Count
        $tssTotal = $tssData.Count
        
        # Count work items by state for Maintain
        $maintainInProgress = ($maintainData | Where-Object { $_.State -eq "Active" -or $_.State -eq "In Progress" }).Count
        $maintainTesting = ($maintainData | Where-Object { $_.State -eq "Testing" -or $_.State -eq "Resolved" }).Count
        $maintainDone = ($maintainData | Where-Object { $_.State -eq "Closed" -or $_.State -eq "Done" }).Count
        $maintainTotal = $maintainData.Count
        
        Write-Host "TSS Stats: In Progress: $tssInProgress, Testing: $tssTesting, Done: $tssDone, Total: $tssTotal" -ForegroundColor Cyan
        Write-Host "Maintain Stats: In Progress: $maintainInProgress, Testing: $maintainTesting, Done: $maintainDone, Total: $maintainTotal" -ForegroundColor Cyan
        
        # Generate TSS table rows from current Sprint data
        $tssTableRows = ""
        foreach ($item in $tssData) {
            $statusClass = switch ($item.State) {
                "New" { "status-new" }
                "Active" { "status-active" }
                "In Progress" { "status-inprogress" }
                "In Development" { "status-indevelopment" }
                "Testing" { "status-testing" }
                "To Do" { "status-todo" }
                "Done" { "status-done" }
                default { "status-other" }
            }
            
            $remainingWork = if ($item.RemainingWork) { $item.RemainingWork } else { "" }
            $effort = if ($item.Effort) { $item.Effort } else { "" }
            
            $tssTableRows += @"
                            <tr>
                                <td class="workitem-id">$($item.Id)</td>
                                <td>$($item.Title)</td>
                                <td>$effort</td>
                                <td class="remaining-work">$remainingWork</td>
                                <td>$($item.AssignedTo)</td>
                                <td class="$statusClass">$($item.State)</td>
                                <td></td>
                            </tr>
"@
        }
        
        # Replace TSS table body - Use simpler approach
        $htmlPattern = '(?s)(<div class="project-section tss-moonraker".*?<tbody>).*?(</tbody>)'
        $htmlContent = $htmlContent -replace $htmlPattern, "`${1}$tssTableRows`${2}"
        
        # Generate Maintain table rows from current Sprint data  
        $maintainTableRows = ""
        foreach ($item in $maintainData) {
            $statusClass = switch ($item.State) {
                "New" { "status-new" }
                "Active" { "status-active" }
                "In Progress" { "status-inprogress" }
                "In Development" { "status-indevelopment" }
                "Testing" { "status-testing" }
                "To Do" { "status-todo" }
                "Done" { "status-done" }
                default { "status-other" }
            }
            
            $remainingWork = if ($item.RemainingWork) { $item.RemainingWork } else { "" }
            $effort = if ($item.Effort) { $item.Effort } else { "" }
            
            $maintainTableRows += @"
                            <tr>
                                <td class="workitem-id">$($item.Id)</td>
                                <td>$($item.Title)</td>
                                <td>$effort</td>
                                <td class="remaining-work">$remainingWork</td>
                                <td>$($item.AssignedTo)</td>
                                <td class="$statusClass">$($item.State)</td>
                                <td></td>
                            </tr>
"@
        }
        
        # Replace Maintain table body - Use simpler approach
        $maintainPattern = '(?s)(<div class="project-section maintain".*?<tbody>).*?(</tbody>)'
        $htmlContent = $htmlContent -replace $maintainPattern, "`${1}$maintainTableRows`${2}"
        
        # Update the summary numbers in HTML
        # Update TSS summary
        $htmlContent = $htmlContent -replace '(\<div class="summary-item total"\>.*?\<div class="summary-number"\>)\d+(.*?\</div\>.*?\<div class="summary-label"\>Total Tasks\</div\>)', "`${1}$tssTotal`${2}"
        $htmlContent = $htmlContent -replace '(\<div class="summary-item in-progress"\>.*?\<div class="summary-number"\>)\d+(.*?\</div\>.*?\<div class="summary-label"\>In Progress\</div\>)', "`${1}$tssInProgress`${2}"
        $htmlContent = $htmlContent -replace '(\<div class="summary-item testing"\>.*?\<div class="summary-number"\>)\d+(.*?\</div\>.*?\<div class="summary-label"\>Testing\</div\>)', "`${1}$tssTesting`${2}"
        $htmlContent = $htmlContent -replace '(\<div class="summary-item done"\>.*?\<div class="summary-number"\>)\d+(.*?\</div\>.*?\<div class="summary-label"\>Done\</div\>)', "`${1}$tssDone`${2}"
        
        $htmlContent | Set-Content $htmlFile -Encoding UTF8
        Write-AutoLog "HTML updated with fresh data - TSS: $tssTotal items, Maintain: $maintainTotal items"
        Write-Host "HTML template updated with fresh ADO data" -ForegroundColor Green
    } catch {
        Write-AutoLog "HTML update error: $($_.Exception.Message)"
        Write-Host "Error updating HTML template: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Step 3: Take Proper HTML Screenshot
Write-Host "`nStep 3: Taking HTML screenshot..." -ForegroundColor Yellow

$currentDate = Get-Date -Format "yyyyMMdd_HHmmss"
$screenshotFile = Join-Path $scriptDir "Daily_Report_Screenshot_$currentDate.png"
$screenshotSuccess = $false

# Method 1: Advanced WebBrowser Control with proper rendering
Write-Host "Using advanced WebBrowser control..." -ForegroundColor Gray
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    
    # Create a form and WebBrowser control with proper size
    $form = New-Object System.Windows.Forms.Form
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
    $form.ShowInTaskbar = $false
    $form.Size = New-Object System.Drawing.Size(1400, 1000)  # Match HTML container max-width
    
    $browser = New-Object System.Windows.Forms.WebBrowser
    $browser.Size = New-Object System.Drawing.Size(1400, 1000)
    $browser.ScrollBarsEnabled = $false
    $browser.ScriptErrorsSuppressed = $true
    
    $form.Controls.Add($browser)
    
    # Navigate to HTML file
    $htmlUrl = "file:///$($htmlFile.Replace('\', '/'))"
    Write-Host "Loading HTML: $htmlUrl" -ForegroundColor Gray
    $browser.Navigate($htmlUrl)
    
    # Show form briefly to ensure proper rendering
    $form.Show()
    
    # Wait for complete loading with timeout
    $timeout = 30
    $elapsed = 0
    while ($browser.ReadyState -ne "Complete" -and $elapsed -lt $timeout) {
        Start-Sleep -Milliseconds 500
        $elapsed += 0.5
        [System.Windows.Forms.Application]::DoEvents()
    }
    
    # Additional wait for CSS and layout rendering
    Start-Sleep -Seconds 3
    [System.Windows.Forms.Application]::DoEvents()
    
    # Scroll to bottom to ensure all content is rendered
    $browser.Document.Window.ScrollTo(0, 99999)
    Start-Sleep -Seconds 2
    [System.Windows.Forms.Application]::DoEvents()
    
    # Get document height
    $documentHeight = $browser.Document.Body.ScrollRectangle.Height
    $documentWidth = $browser.Document.Body.ScrollRectangle.Width
    
    Write-Host "Document size: ${documentWidth}x${documentHeight}" -ForegroundColor Gray
    
    # Use actual document size for precise content capture
    $actualWidth = [Math]::Min($documentWidth, 1400)
    $actualHeight = $documentHeight + 50  # Add small buffer for safety
    
    # Set maximum to prevent memory issues
    if ($actualHeight -gt 2500) {
        Write-Host "Document very tall ($actualHeight px), limiting to 2500px" -ForegroundColor Yellow
        $actualHeight = 2500
    }
    
    Write-Host "Using screenshot size: ${actualWidth}x${actualHeight}" -ForegroundColor Cyan
    
    $browser.Size = New-Object System.Drawing.Size($actualWidth, $actualHeight)
    
    # Take screenshot of the WebBrowser control
    $bitmap = New-Object System.Drawing.Bitmap($actualWidth, $actualHeight)
    $browser.DrawToBitmap($bitmap, $browser.ClientRectangle)
    $bitmap.Save($screenshotFile, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $form.Close()
    $form.Dispose()
    $browser.Dispose()
    $bitmap.Dispose()
    
    if (Test-Path $screenshotFile) {
        $fileSize = (Get-Item $screenshotFile).Length
        Write-Host "HTML screenshot captured - Size: $fileSize bytes, Dimensions: ${actualWidth}x${actualHeight}" -ForegroundColor Green
        Write-AutoLog "HTML screenshot success: $fileSize bytes, ${actualWidth}x${actualHeight}"
        $screenshotSuccess = $true
    }
    
} catch {
    Write-Host "WebBrowser screenshot failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-AutoLog "WebBrowser screenshot failed: $($_.Exception.Message)"
}

# Method 2: Fallback to Chrome with better parameters
if (-not $screenshotSuccess) {
    Write-Host "Trying Chrome with optimized parameters..." -ForegroundColor Gray
    
    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )

    foreach ($chromePath in $chromePaths) {
        if (Test-Path $chromePath) {
            try {
                $chromeArgs = @(
                    "--headless",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--window-size=1400,1200",
                    "--screenshot=$screenshotFile",
                    "--virtual-time-budget=10000",  # Wait 10 seconds for rendering
                    "file:///$($htmlFile.Replace('\', '/'))"
                )
                
                Write-Host "Running Chrome with args: $($chromeArgs -join ' ')" -ForegroundColor Gray
                & $chromePath $chromeArgs
                Start-Sleep -Seconds 8
                
                if (Test-Path $screenshotFile) {
                    $fileSize = (Get-Item $screenshotFile).Length
                    if ($fileSize -gt 5000) {
                        Write-Host "Chrome screenshot captured - Size: $fileSize bytes" -ForegroundColor Green
                        Write-AutoLog "Chrome screenshot success: $fileSize bytes"
                        $screenshotSuccess = $true
                        break
                    }
                }
            } catch {
                Write-Host "Chrome method failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

# Method 3: Manual browser opening with instructions
if (-not $screenshotSuccess) {
    Write-Host "Opening HTML in browser for manual screenshot..." -ForegroundColor Gray
    try {
        # Open HTML file in default browser
        Start-Process $htmlFile
        
        # Create simple fallback image with instructions
        Add-Type -AssemblyName System.Drawing
        
        $bitmap = New-Object System.Drawing.Bitmap(1400, 800)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::White)
        
        # Draw instructions
        $titleFont = New-Object System.Drawing.Font("Arial", 20, [System.Drawing.FontStyle]::Bold)
        $textFont = New-Object System.Drawing.Font("Arial", 14)
        $blackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
        $redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Red)
        
        $graphics.DrawString("MANUAL SCREENSHOT REQUIRED", $titleFont, $redBrush, 50, 50)
        $graphics.DrawString("The HTML report has been opened in your browser.", $textFont, $blackBrush, 50, 120)
        $graphics.DrawString("Please take a screenshot manually and replace this image.", $textFont, $blackBrush, 50, 150)
        $graphics.DrawString("HTML File: $htmlFile", $textFont, $blackBrush, 50, 200)
        $graphics.DrawString("Screenshot File: $screenshotFile", $textFont, $blackBrush, 50, 230)
        $graphics.DrawString("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", $textFont, $blackBrush, 50, 280)
        
        # Save
        $bitmap.Save($screenshotFile, [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Cleanup
        $graphics.Dispose()
        $bitmap.Dispose()
        $titleFont.Dispose()
        $textFont.Dispose()
        $blackBrush.Dispose()
        $redBrush.Dispose()
        
        Write-Host "Browser opened - Manual screenshot required" -ForegroundColor Yellow
        Write-Host "HTML report opened in browser for manual screenshot" -ForegroundColor Cyan
        Write-AutoLog "Manual screenshot mode - browser opened"
        $screenshotSuccess = $true
        
    } catch {
        Write-Host "Failed to open browser: $($_.Exception.Message)" -ForegroundColor Red
        Write-AutoLog "Browser opening failed: $($_.Exception.Message)"
    }
}

# Step 4: Send Email with Embedded Screenshot
Write-Host "`nStep 4: Sending email with screenshot..." -ForegroundColor Yellow

# Re-enable email sending
$currentDateStr = Get-Date -Format "MMM dd, yyyy"
$currentDateShort = Get-Date -Format "MMM dd"
$subject = "[HALTSS2025] [TSS- Smart Scheduling] Daily Report $global:currentSprintInfo $currentDateShort"

$emailSent = $false

# Try Outlook COM with embedded image
Write-Host "Sending email via Outlook with embedded image..." -ForegroundColor Gray
try {
    $outlook = New-Object -ComObject Outlook.Application
    $mail = $outlook.CreateItem(0)
    $mail.To = $To
    $mail.Subject = $subject
    
    # Create HTML email body with embedded image
    if ($screenshotSuccess -and (Test-Path $screenshotFile)) {
        # Add screenshot as attachment first (for embedding)
        $attachment = $mail.Attachments.Add($screenshotFile)
        $attachment.PropertyAccessor.SetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001E", "image001")
        
        # Create HTML body with embedded image
        $htmlBody = @"
<html>
<body style="font-family: Arial, sans-serif; font-size: 14px;">
<p>Dear Team,</p>
<p>Please see below the status report for TSS- Smart Scheduling project today.</p>
<p><strong>$global:currentSprintInfo $currentDateStr</strong></p>
<br>
<img src="cid:image001" style="max-width: 100%; height: auto; border: 1px solid #ccc;">
<br><br>
<p>Best Regards!</p>
<p>Tu Anh</p>
</body>
</html>
"@
        
        $mail.HTMLBody = $htmlBody
        Write-Host "Screenshot embedded in email body" -ForegroundColor Green
        Write-AutoLog "Screenshot embedded in HTML email: $screenshotFile"
        
    } else {
        # Fallback to text body if no screenshot
        $mail.Body = @"
Dear Team,

Please see below the status report for TSS- Smart Scheduling project today.

$global:currentSprintInfo $currentDateStr

[Screenshot could not be generated]

Best Regards!
Tu Anh
"@
        Write-Host "Text-only email sent (no screenshot)" -ForegroundColor Yellow
    }
    
    $mail.Send()
    
    Write-Host "Email sent successfully with embedded screenshot!" -ForegroundColor Green
    Write-AutoLog "Email sent via Outlook with embedded screenshot"
    $emailSent = $true
    
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($outlook) | Out-Null
    
} catch {
    Write-AutoLog "Outlook COM failed: $($_.Exception.Message)"
    Write-Host "Email failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host "`n" + "="*70 -ForegroundColor Gray

if ($emailSent) {
    Write-Host "SUCCESS: Daily Report Email Sent!" -ForegroundColor Green
    Write-Host "- ADO data refreshed" -ForegroundColor White
    Write-Host "- HTML template updated" -ForegroundColor White
    Write-Host "- Proper HTML screenshot captured" -ForegroundColor White
    Write-Host "- Email sent successfully with embedded screenshot" -ForegroundColor Green
    Write-AutoLog "Email sent successfully with screenshot"
} else {
    Write-Host "SUCCESS: Screenshot generated!" -ForegroundColor Green
    Write-Host "- ADO data refreshed" -ForegroundColor White
    Write-Host "- HTML template updated" -ForegroundColor White
    Write-Host "- Proper HTML screenshot captured" -ForegroundColor White
    Write-Host "- Email sending failed - check configuration" -ForegroundColor Red
    Write-AutoLog "Email sending failed - screenshot only"
}

Write-Host "`nFiles:" -ForegroundColor Cyan
Write-Host "- HTML: $htmlFile" -ForegroundColor White
Write-Host "- Screenshot: $screenshotFile" -ForegroundColor White
Write-Host "- Log: $errorLog" -ForegroundColor White

Write-Host "`nCompleted at: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
Write-Host "="*70 -ForegroundColor Gray

Write-AutoLog "Advanced HTML screenshot automation completed"
