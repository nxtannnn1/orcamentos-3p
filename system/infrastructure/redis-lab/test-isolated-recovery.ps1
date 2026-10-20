[CmdletBinding()]
param([string]$ReportPath = (Join-Path $PWD 'isolated-recovery-report.json'))
# Synthetic data only. Existing Redis is inspected for its immutable image ID;
# neither its network nor its volume is mounted or modified by this experiment.
$ErrorActionPreference='Stop'
$prefix='3p-r2-isolated-'+[guid]::NewGuid().ToString('N').Substring(0,12)
$source="$prefix-source"; $restored="$prefix-restored"
$data="$prefix-data"; $backup="$prefix-backup"; $restore="$prefix-restore"
$rows=[System.Collections.Generic.List[object]]::new()
$created=[System.Collections.Generic.List[string]]::new()
function InvokeLabDocker([string[]]$Arguments) {
    $output=& docker @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Isolated Docker operation failed' }
    return ($output -join "`n").Trim()
}
function Check([string]$Name,[bool]$Pass) {
    $rows.Add([pscustomobject]@{name=$Name;status=$(if($Pass){'PASS'}else{'FAIL'})})
    if (!$Pass) { throw 'Isolated acceptance failed' }
}
function WaitReady([string]$Name) {
    for($attempt=0;$attempt -lt 25;$attempt++) {
        $ping=& docker exec $Name redis-cli --raw PING 2>$null
        if ($LASTEXITCODE -eq 0 -and $ping -eq 'PONG') { return }
        Start-Sleep -Milliseconds 400
    }
    throw 'Isolated Redis not ready'
}
try {
    $info=(InvokeLabDocker @('inspect','3p-redis-lab-redis-1') | ConvertFrom-Json)[0]
    if ($info.Config.Labels.'com.docker.compose.project' -ne '3p-redis-lab') { throw 'Unexpected source image identity' }
    $image=$info.Image
    foreach($volume in @($data,$backup,$restore)) {
        $null=InvokeLabDocker @('volume','create','--label','3p.synthetic-recovery=true',$volume)
    }
    $null=InvokeLabDocker @('run','-d','--name',$source,'--network','none','--memory','128m','--cpus','0.5',
        '--label','3p.synthetic-recovery=true','--mount',"type=volume,src=$data,dst=/data",$image,
        'redis-server','--appendonly','yes','--appendfsync','always','--maxmemory','64mb','--maxmemory-policy','noeviction','--save','')
    $created.Add($source); WaitReady $source
    $runtime=(InvokeLabDocker @('inspect',$source) | ConvertFrom-Json)[0]
    Check 'no-network-or-existing-volume' ($runtime.HostConfig.NetworkMode -eq 'none' -and $runtime.Mounts[0].Name -eq $data)
    Check 'synthetic-write' ((InvokeLabDocker @('exec',$source,'redis-cli','SET','3p:synthetic:marker','fictional','NX')) -eq 'OK')
    $null=InvokeLabDocker @('restart',$source); WaitReady $source
    Check 'AOF-after-controlled-restart' ((InvokeLabDocker @('exec',$source,'redis-cli','--raw','GET','3p:synthetic:marker')) -eq 'fictional')
    Check 'synthetic-before-crash-write' ((InvokeLabDocker @('exec',$source,'redis-cli','SET','3p:synthetic:crash','confirmed-fictional')) -eq 'OK')
    $null=InvokeLabDocker @('kill','--signal','KILL',$source)
    $null=InvokeLabDocker @('start',$source); WaitReady $source
    Check 'AOF-after-process-crash' ((InvokeLabDocker @('exec',$source,'redis-cli','--raw','GET','3p:synthetic:crash')) -eq 'confirmed-fictional')
    # Quiesce this disposable source; copying active AOF files is not a backup protocol.
    $null=InvokeLabDocker @('stop',$source)
    $null=InvokeLabDocker @('run','--rm','--network','none','--mount',"type=volume,src=$data,dst=/from,readonly",'--mount',"type=volume,src=$backup,dst=/backup",$image,
        'sh','-c','cd /from && tar cf /backup/aof.tar appendonlydir')
    Check 'consistent-offline-AOF-backup' $true
    $null=InvokeLabDocker @('run','--rm','--network','none','--mount',"type=volume,src=$backup,dst=/backup,readonly",'--mount',"type=volume,src=$restore,dst=/data",$image,
        'sh','-c','cd /data && tar xf /backup/aof.tar && redis-check-aof /data/appendonlydir/appendonly.aof.manifest')
    Check 'restored-AOF-manifest-check' $true
    $null=InvokeLabDocker @('run','-d','--name',$restored,'--network','none','--memory','128m','--cpus','0.5',
        '--label','3p.synthetic-recovery=true','--mount',"type=volume,src=$restore,dst=/data",$image,
        'redis-server','--appendonly','yes','--appendfsync','always','--maxmemory','64mb','--maxmemory-policy','noeviction','--save','')
    $created.Add($restored); WaitReady $restored
    Check 'restore-original-marker' ((InvokeLabDocker @('exec',$restored,'redis-cli','--raw','GET','3p:synthetic:marker')) -eq 'fictional')
    Check 'restore-crash-marker' ((InvokeLabDocker @('exec',$restored,'redis-cli','--raw','GET','3p:synthetic:crash')) -eq 'confirmed-fictional')
} catch { $rows.Add([pscustomobject]@{name='isolated-execution';status='FAIL'}) }
finally {
    # Keep synthetic volumes/containers for evidence; stop only names generated here.
    foreach($name in $created) { $null=& docker stop $name 2>$null }
    @{scope='synthetic-isolated-only';utc=[DateTime]::UtcNow.ToString('o');image=$image;
      containers=@($created.ToArray());volumes=@($data,$backup,$restore);results=@($rows.ToArray());
      limitation='Does not homologate recovery of the existing Redis or host/storage loss.'} |
      ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}
if (@($rows | Where-Object status -eq 'FAIL').Count) { exit 1 }
exit 0
