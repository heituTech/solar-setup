$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000'
$pass = 0
$fail = 0

function Check($name, $ok, $detail) {
  if ($ok) { $script:pass++; "PASS  {0,-46} {1}" -f $name, $detail }
  else { $script:fail++; "FAIL  {0,-46} {1}" -f $name, $detail }
}

function Get-Code($url, $headers = @{}) {
  try {
    $r = Invoke-WebRequest -Uri ($base + $url) -UseBasicParsing -TimeoutSec 15 -Headers $headers
    return @{ code = [int]$r.StatusCode; body = $r.Content }
  } catch {
    $c = 0
    if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    return @{ code = $c; body = '' }
  }
}

# --- pages ---
$pages = @('/pv/', '/pv/tool', '/pv/member', '/pv/member/profile', '/pv/account', '/pv/admin')
foreach ($p in $pages) {
  $r = Get-Code $p
  Check "page $p" ($r.code -eq 200) "HTTP $($r.code)"
}

# --- static PSH dataset ---
$r = Get-Code '/pv/data/pvgis-psh.json'
$points = 0
try { $points = ($r.body | ConvertFrom-Json).points.Count } catch {}
Check 'pvgis-psh.json' ($r.code -eq 200 -and $points -gt 2000) "HTTP $($r.code), points=$points"

# --- retired PVGIS proxy ---
$r = Get-Code '/pv/api/geo/psh?lat=11.5&lon=104.9'
Check 'retired /geo/psh removed' ($r.code -eq 404) "HTTP $($r.code)"

# --- geo cascade ---
$r = Get-Code '/pv/api/geo/countries'
$ct = @()
try { $ct = $r.body | ConvertFrom-Json } catch {}
Check 'geo countries' ($r.code -eq 200 -and $ct.Count -gt 200) "HTTP $($r.code), count=$($ct.Count)"
Check 'geo countries pinned KH,CN' ($ct.Count -ge 2 -and $ct[0].code -eq 'KH' -and $ct[1].code -eq 'CN') "order=$($ct[0].code),$($ct[1].code)"

$r = Get-Code '/pv/api/geo/states?country=KH'
$st = @()
try { $st = $r.body | ConvertFrom-Json } catch {}
Check 'geo states KH' ($r.code -eq 200 -and $st.Count -gt 0) "HTTP $($r.code), count=$($st.Count)"

if ($st.Count -gt 0) {
  $sid = $st[0].code
  $r = Get-Code "/pv/api/geo/cities?country=KH&state=$sid"
  $ci = @()
  try { $ci = $r.body | ConvertFrom-Json } catch {}
  Check 'geo cities KH' ($r.code -eq 200) "HTTP $($r.code), count=$($ci.Count)"
}

# --- public config & products ---
$r = Get-Code '/pv/api/config'
Check 'config' ($r.code -eq 200) "HTTP $($r.code)"
$r = Get-Code '/pv/api/products/panels'
Check 'products/panels' ($r.code -eq 200) "HTTP $($r.code)"

# --- member login ---
$loginCode = 0
$token = ''
try {
  $body = @{ identifier = 'zhang.mincan@heitu.tech'; password = 'Test12345' } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri ($base + '/pv/api/auth/login') -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 20
  $loginCode = [int]$r.StatusCode
  $token = ($r.Content | ConvertFrom-Json).token
} catch {
  if ($_.Exception.Response) { $loginCode = [int]$_.Exception.Response.StatusCode }
}
Check 'member login' ($loginCode -eq 200 -and $token) "HTTP $loginCode"

if ($token) {
  $h = @{ Authorization = 'Bearer ' + $token }
  $r = Get-Code '/pv/api/auth/me' $h
  $role = ''
  try { $role = ($r.body | ConvertFrom-Json).user.role } catch {}
  Check 'auth/me' ($r.code -eq 200 -and $role -eq 'member') "HTTP $($r.code), role=$role"

  $r = Get-Code '/pv/api/cases' $h
  $cases = 0
  try { $cases = ($r.body | ConvertFrom-Json).Count } catch {}
  Check 'cases list' ($r.code -eq 200) "HTTP $($r.code), cases=$cases"

  $r = Get-Code '/pv/skill/member/app' $h
  Check 'skill/member/app' ($r.code -eq 200) "HTTP $($r.code)"
}

# --- asset versions ---
foreach ($a in @('/pv/css/style.css?v=11', '/pv/js/psh-store.js', '/pv/js/ai-dock.js', '/pv/js/member.js?v=9')) {
  $r = Get-Code $a
  Check "asset $a" ($r.code -eq 200) "HTTP $($r.code)"
}

""
"RESULT pass=$pass fail=$fail"
if ($fail -gt 0) { exit 1 }
