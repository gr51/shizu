# gen-planes.ps1 · 批量生成 12 位面（除机关城/武侠外）的敌人资产图
# 每个位面：2 小怪 + 1 Boss，各 8 帧资产图（2x4 网格）
$ErrorActionPreference = 'Continue'
$out = Join-Path (Split-Path -Parent $PSScriptRoot) '.tmp\sheet'
New-Item -ItemType Directory -Force -Path $out | Out-Null
# API Key 不入库：优先环境变量 SHIZU_AI_KEY，其次本地文件 .tmp/ai-key.txt（已 gitignore）
$key = $env:SHIZU_AI_KEY
if (-not $key) {
  $keyFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.tmp\ai-key.txt'
  if (Test-Path $keyFile) { $key = (Get-Content $keyFile -Raw).Trim() }
}
if (-not $key) { Write-Error '未找到 API Key：请设置环境变量 SHIZU_AI_KEY，或写入 .tmp/ai-key.txt'; exit 1 }
$uri = 'https://api.67.si/v1/images/generations'
$hdr = @{ Authorization = "Bearer $key" }
$ANCHOR = "16-bit retro arcade pixel art, Chinese ink wash watercolor aesthetic, crisp dark ink outlines, high contrast, clean, no photorealism, no 3D render, no watermark, no glow aura, no film grain"
$BG = "PLAIN SOLID UNIFORM WHITE background (pure white, perfectly flat, no texture, no grain)"

$roster = @(
  @{ p='aofa'; e=@( @{ id='yuan_jingling'; ch="floating arcane sprite, glowing rune ball, wizard hat, tiny, ranged, facing right" }, @{ id='huo_bing'; ch="fire elemental, flame body, floating, ranged, facing right" } ); boss="secret mage king, tall robed archmage, magic staff, floating rune rings, imposing, facing right" },
  @{ p='qiqiao'; e=@( @{ id='jiguan_shou'; ch="clockwork mechanism beast, brass gear body, mechanical legs, facing right" }, @{ id='fashu_jiguan'; ch="magical mechanism, brass and rune hybrid body, shooting energy, facing right" } ); boss="hundred-machine king, colossal clockwork mech lord, many gears and arms, laser eyes, facing right" },
  @{ p='dujie'; e=@( @{ id='lei_jing'; ch="thunder spirit wisp, crackling purple lightning body, floating, ranged, facing right" }, @{ id='jianxiu_kuilei'; ch="sword monk puppet, wooden body, carrying flying sword, thunder aura, facing right" } ); boss="thunder tribulation god, giant purple-robed deity, surrounded by lightning and storm, floating, facing right" },
  @{ p='gongde'; e=@( @{ id='jinlian_shicong'; ch="golden lotus attendant, buddhist robe, serene, carrying lotus, facing right" }, @{ id='luohan_wuseng'; ch="arhat warrior monk, muscular, bald, golden light, fist stance, facing right" } ); boss="golden body buddha, giant radiant golden buddha figure, lotus throne, holy light, imposing, facing right" },
  @{ p='shihai'; e=@( @{ id='sangshi'; ch="shambling zombie, decaying flesh, torn clothes, reaching arms, facing right" }, @{ id='bianyi_quan'; ch="mutant hound zombie, lean feral body, exposed spine, glowing green eyes, facing right" } ); boss="annihilator zombie king, gigantic mutated corpse monster, glowing green core, facing right" },
  @{ p='gongshengchao'; e=@( @{ id='jishengchong'; ch="parasite creature, small round body, purple tendrils, crawling, facing right" }, @{ id='fuhua_chong'; ch="hatchling creature, egg-like body, sprouting tendrils, facing right" } ); boss="myriad life hive mother, massive organic brood mother, many tentacles and sacs, facing right" },
  @{ p='shanhai'; e=@( @{ id='huangshou'; ch="wild beast cub, furry horned cub, squat powerful body, facing right" }, @{ id='jujiao_shou'; ch="giant horned beast, massive horns, shaggy fur, four legs, facing right" } ); boss="taotie glutton beast, colossal hungry beast with huge open mouth, jagged fangs, facing right" },
  @{ p='jijia'; e=@( @{ id='shaojie'; ch="sentry robot, small round mech, single red eye, twin guns, hover, facing right" }, @{ id='zizou_pao'; ch="self-propelled cannon mech, tracked body, long barrel, facing right" } ); boss="type zero mech, massive silver battle mech, missile pods, energy shield, facing right" },
  @{ p='jushen'; e=@( @{ id='ju_ying'; ch="giant eagle, huge wingspan, sharp talons, flying, facing right" }, @{ id='shi_juren'; ch="stone giant, massive rocky humanoid, moss cracks, slow, facing right" } ); boss="titan giant, colossal cloud-piercing giant, thunderous fists, facing right" },
  @{ p='zhutian'; e=@( @{ id='weimian_canying'; ch="plane remnant wraith, ghostly multicolor form, fragmented, floating, facing right" }, @{ id='ziwo_jingxiang'; ch="mirror clone spirit, mirrored humanoid, reflective glass body, facing right" } ); boss="collapse shadow, vast cosmic dark entity, shattered dimensions, multi-colored void, facing right" }
)

$filter = $args[0]
$items = @()
foreach ($r in $roster) {
  if ($filter -and $r.p -ne $filter) { continue }
  foreach ($en in $r.e) {
    $items += @{ name="$($en.id)_atlas"; plane=$r.p; kind='minion'; prompt="Sprite sheet atlas, exactly 8 sprites of ONE single character in a 2 rows x 4 columns grid, CLEAR WHITE GAPS, no overlapping, every sprite full body nothing cut off, same size. $BG. Row 1 (4 walk poses): A/B/C/D. Row 2: attack windup, attack strike, attack follow-through, death pose. Character: $($en.ch). $ANCHOR" }
  }
  $items += @{ name="$($r.p)_boss"; plane=$r.p; kind='boss'; prompt="Sprite sheet atlas, exactly 8 sprites of ONE single character in a 2 rows x 4 columns grid, CLEAR WHITE GAPS, no overlapping, full body, same size. $BG. Row 1 (4 idle/drift poses): A/B/C/D. Row 2: attack windup, big attack, follow-through, death pose. Character: $($r.boss). $ANCHOR" }
}

foreach ($it in $items) {
  $body = @{ model="grok-imagine-image-quality"; prompt=$it.prompt; n=1; size="1536x1024" } | ConvertTo-Json
  $ok = $false
  for ($i = 1; $i -le 3; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers $hdr -ContentType "application/json" -Body $body -TimeoutSec 300
      $item = $resp.data[0]
      if ($item.url) { Invoke-WebRequest -Uri $item.url -OutFile "$out\$($it.name).png" -TimeoutSec 60 -UseBasicParsing; "OK $($it.name) [$($it.plane)]"; $ok = $true; break }
      elseif ($item.b64_json) { [IO.File]::WriteAllBytes("$out\$($it.name).png", [Convert]::FromBase64String($item.b64_json)); "OK(b64) $($it.name)"; $ok = $true; break }
    } catch { "try $i err ($($it.name)): $($_.Exception.Message)" }
  }
  if (-not $ok) { "FAIL $($it.name)" }
  Start-Sleep -Milliseconds 300
}
"DONE planes=$filter items=$($items.Count)"