// ===== ai-art/stage-spec.mjs · 12 planes x 5 stages x 5 enemy slots =====
//
// Every stage owns three readable minion roles plus one elite and one boss.
// The same contract drives generation, slicing, runtime lookup, and auditing.

export const SLOT_IDS = ['walker', 'charger', 'spitter', 'elite', 'boss'];
export const STAGE_COUNT = 5;

const stage = (name, motif, eliteName, eliteLook, bossName, bossLook) => ({
  name, motif, elite: { name: eliteName, look: eliteLook }, boss: { name: bossName, look: bossLook },
});

export const PLANES = [
  {
    codex: 1, id: 'jiguan', name: '机关城',
    world: 'an ancient brass clockwork city of gears, springs, furnaces and jade-green power cores',
    palette: 'dark iron, aged brass, oxidized teal, restrained furnace orange',
    minions: [
      'a squat gear rat with biting brass incisors and exposed winding key',
      'a lean spring-loaded clockwork hound built for a straight-line charge',
      'a low tripod bolt turret with a glowing teal lens and compact crossbow barrel',
    ],
    stages: [
      stage('齿轮长廊', 'small gears, chain rails and service tunnels', '棘轮监工', 'a rat-shaped foreman automaton with wrench claws', '啮轮兽', 'a broad gear-maw beast with rotating teeth'),
      stage('齿轮走廊', 'flywheels, belt drives and suspended saw blades', '飞轮猎手', 'a hovering hunter made from twin razor flywheels', '锯环领主', 'a heavy ring-shaped saw engine with a masked core'),
      stage('轴承大厅', 'massive bearings, pistons and polished axle housings', '发条守卫', 'a tall armored clockwork guard with piston shield', '轴承巨卫', 'a rolling colossus built around a giant ball bearing'),
      stage('机芯回廊', 'glowing cores, pressure gauges and furnace pipes', '机芯执政官', 'a four-armed core warden with tuning forks', '熔炉傀儡', 'a furnace-bellied puppet venting orange heat'),
      stage('傀儡之主', 'royal machine dais, crown gears and severed control cables', '王庭机偶', 'an ornate elite puppet knight with a teal heart', '傀儡巨像', 'a towering multi-part puppet colossus with detachable arms and crown gear'),
    ],
  },
  {
    codex: 2, id: 'aofa', name: '奥法王国',
    world: 'a ruined arcane kingdom of floating libraries, rune circles and crystal towers',
    palette: 'midnight indigo, arcane cyan, violet crystal, restrained ember gold',
    minions: [
      'a compact arcane wisp knight wrapped around a luminous rune core',
      'a flame-tailed elemental familiar lunging forward like a comet',
      'a floating frost eye caster surrounded by three tiny ice shards',
    ],
    stages: [
      stage('法术庭院', 'broken academy statues and beginner spell circles', '符文学监', 'a robed rune tutor with a floating slate shield', '庭院咒像', 'a stone spell idol animated by blue glyphs'),
      stage('元素回廊', 'paired fire and ice channels with crystal conduits', '双相元素使', 'a split fire-and-frost mage with asymmetric silhouette', '元素聚合体', 'a hulking fusion of flame, ice and crackling mana'),
      stage('图书馆', 'levitating books, chained tomes and star maps', '元素导师', 'an elder caster with orbiting books and three fire orbs', '禁书吞噬者', 'a many-toothed living grimoire with ribbon-like pages'),
      stage('法师塔中层', 'teleport gates, brass astrolabes and unstable crystals', '奥术魔像', 'a faceted crystal golem with massive rune fists', '星盘守卫', 'a celestial construct built around a rotating astrolabe'),
      stage('法师塔顶', 'open night sky, grand summoning circle and shattered crown', '王庭大法师', 'an ornate battle mage with prismatic staff and ward discs', '秘法王', 'a regal archmage floating above a full-body rune mantle and portal halo'),
    ],
  },
  {
    codex: 3, id: 'qiqiao', name: '奇巧迷宫',
    world: 'an impossible enchanted labyrinth mixing clockwork mechanisms, mirrors and spell machinery',
    palette: 'charcoal, antique copper, mirror silver, cyan and magenta magical accents',
    minions: [
      'a compact clockwork beetle with key-shaped horns and articulated legs',
      'a razor-thin mirror hound with spring joints and reflective flanks',
      'a hovering puzzle turret that fires beams through a faceted prism eye',
    ],
    stages: [
      stage('机关花园', 'mechanical flowers, hedge gears and winding-vine cables', '园艺机师', 'a gardener automaton with shears and seed-bomb pods', '百花机兽', 'a floral clockwork beast opening into layered metal petals'),
      stage('迷宫岔路', 'three-way corridors, arrow tiles and shifting walls', '岔路判官', 'a signpost-headed sentinel with three blade arms', '歧途巨像', 'a blocky maze golem with rotating corridor limbs'),
      stage('镜面回廊', 'tall mirrors, duplicated reflections and refracted beams', '双面傀儡', 'a two-faced puppet split into light and dark halves', '万镜兽', 'a many-limbed reflective predator with prism plates'),
      stage('齿轮深渊', 'bottomless gear pits, chains and unstable magic engines', '奇技魔像', 'a dense hybrid golem of gears, runes and grappling arms', '深渊机皇', 'a suspended machine tyrant with chain tentacles and void core'),
      stage('迷宫之心', 'central puzzle core, concentric tracks and laser mirrors', '心核侍卫', 'an elite guardian with key staff and mirrored shield', '百机王', 'a grand many-armed automaton king with crown maze and sweeping laser eye'),
    ],
  },
  {
    codex: 4, id: 'dujie', name: '渡劫之域',
    world: 'storm-wracked cultivation ruins above a thunder sea, flying swords and tribulation altars',
    palette: 'storm navy, rain gray, electric cyan, pale jade and lightning white',
    minions: [
      'a small thunder spirit with horned cloud body and clawed lightning hands',
      'a sword cultivator puppet wrapped in wind ribbons and lunging on a flying blade',
      'a floating talisman caster with a single eye and a fan of electric seals',
    ],
    stages: [
      stage('雷泽', 'flooded stone flats, forked lightning and broken conductors', '雷泽巡使', 'an armored storm spirit carrying a forked thunder spear', '霆角雷兽', 'a massive horned quadruped made from storm clouds'),
      stage('渡劫台', 'circular jade altar, sword racks and scorched prayer posts', '飞剑执事', 'a masked cultivator controlling six flying swords', '劫台剑魁', 'a broad sword puppet with a ring of oversized blades'),
      stage('天雷区', 'blackened peaks, suspended talismans and vertical lightning pillars', '雷刑官', 'a stern executioner in dark robes holding chained thunder blades', '九霄雷狱', 'a prison-like lightning entity with multiple electric arms'),
      stage('仙穹废墟', 'collapsed celestial palaces and drifting roof tiles', '渡劫老怪', 'a weathered ascetic surrounded by a dense flying-sword formation', '坠天仙尸', 'a gigantic fallen immortal husk split by glowing lightning cracks'),
      stage('九重天', 'nine cloud terraces and a cosmic tribulation seal', '天劫神将', 'a celestial general with thunder drum and banner', '雷劫神君', 'a towering divine judge with a halo of nine thunder rings and giant lightning sword'),
    ],
  },
  {
    codex: 5, id: 'gongde', name: '功德圣境',
    world: 'a solemn lotus sanctuary of golden statues, incense, prayer wheels and jade courtyards',
    palette: 'deep maroon, old gold, jade green, smoke gray and warm ivory',
    minions: [
      'a stout golden lotus attendant with prayer-bead knuckles',
      'a lean arhat boxer in a forward rushing stance with cloth wraps',
      'a floating incense-lamp spirit that fires small golden seals',
    ],
    stages: [
      stage('莲花池', 'dark lotus water, stone bridges and floating votive lights', '莲池护法', 'a four-armed lotus guardian with petal shield', '千瓣金兽', 'a crouched guardian beast opening a halo of metal lotus petals'),
      stage('罗汉阵', 'training court, bronze bells and geometric monk formations', '铁臂罗汉', 'a muscular monk with oversized bronze forearms', '伏虎尊者', 'a giant arhat riding a stylized golden tiger spirit'),
      stage('功德碑林', 'dense stone steles, prayer ribbons and ghostly inscriptions', '护法金刚', 'an armored vajra guardian with reflective golden skin', '碑林业兽', 'a hulking beast assembled from cracked merit steles'),
      stage('圣境梯', 'endless stairway, clouds, bells and radiant gateways', '降魔罗汉', 'a leaping exorcist monk with staff and circular light formation', '阶前明王', 'a wrathful many-armed guardian blocking the celestial stairs'),
      stage('金身殿', 'vast dark hall, giant aureole and burning offering braziers', '金身侍尊', 'an elite gilded monk with bell shield and flame beads', '金身佛陀', 'a monumental seated golden figure with cracked serene mask and full-screen fire halo'),
    ],
  },
  {
    codex: 6, id: 'shihai', name: '尸海末世',
    world: 'a collapsed plague megacity drowned in corpse tides, rusted vehicles and toxic fog',
    palette: 'asphalt black, corpse gray-green, rust red, toxic lime and emergency orange',
    minions: [
      'a shambling plated corpse with broken street armor and grasping hands',
      'a low mutant hound with exposed spine and powerful sprinting legs',
      'a swollen plague spitter with a bright toxic throat sac',
    ],
    stages: [
      stage('废土街', 'wrecked storefronts, abandoned cars and quarantine barriers', '街区屠夫', 'a massive butcher corpse wielding a road sign cleaver', '公交尸巢', 'a bus-sized crawling corpse mass tangled with vehicle parts'),
      stage('尸潮巷', 'tight alleys, fire escapes and piled bodies', '猎犬母体', 'a tall kennel mutant spawning smaller hounds from its back', '巷口暴食者', 'a wall-filling jawed mutant wedged in ruined masonry'),
      stage('死城广场', 'dry fountain, emergency screens and concentric corpse piles', '暴君丧尸', 'a broad military brute with roaring mouth and armored shoulders', '广场尸塔', 'a towering fused column of bodies with many reaching arms'),
      stage('尸山', 'mountains of corpses, broken cranes and green vapor vents', '尸巫', 'a thin plague shaman with bone staff and orbiting skull spores', '万尸行者', 'a giant walking mound of fused undead and construction debris'),
      stage('尸王殿', 'ruined civic hall transformed into a pulsing necrotic throne', '灭世近卫', 'an elite black-plated corpse knight with toxic core', '湮灭者', 'a colossal corpse king with reactor-like rib cage and expanding blast sacs'),
    ],
  },
  {
    codex: 7, id: 'gongshengchao', name: '共生巢',
    world: 'a wet bioluminescent alien hive of fungal membranes, eggs, tendrils and bone arches',
    palette: 'near-black purple, bruised crimson, fungal teal, bone ivory and spore amber',
    minions: [
      'a round parasite larva with mandibles and two glowing sensory stalks',
      'a lean hatchling beetle with hooked legs and stretched membrane wings',
      'a rooted spore sac creature with a luminous mouth and projectile pods',
    ],
    stages: [
      stage('菌毯', 'living fungal carpet, cap clusters and pulsing vein channels', '菌毯牧者', 'a tall fungal shepherd with tendril crook and spore mantle', '孢潮兽', 'a broad slug-like beast carrying a forest of explosive caps'),
      stage('母巢外围', 'egg mounds, rib gates and translucent incubation sacs', '孵化监护', 'an armored insect nurse with egg shield and feeder limbs', '破壳巨虫', 'a huge newborn beetle tearing through a cracked royal egg'),
      stage('共生走廊', 'narrow membrane tunnels and paired organisms fused to walls', '寄生先锋', 'a humanoid host overtaken by a bright back-mounted parasite', '双生猎体', 'two asymmetric predators fused along one glowing spine'),
      stage('巢穴深层', 'bone pillars, dripping resin and branching nerve roots', '分裂母体', 'a swollen elite organism dividing into mirrored torsos', '深巢脑兽', 'a many-legged brain-like beast with cable tendrils'),
      stage('巢母之心', 'heart chamber, giant vascular core and concentric egg throne', '巢母亲卫', 'a royal carapace guardian with crown horns and pincer shield', '万生', 'a colossal hive mother combining insect, fungus and floral anatomy around a radiant core'),
    ],
  },
  {
    codex: 8, id: 'wuxia', name: '武侠江湖',
    world: 'a rain-dark wuxia realm of tavern streets, bamboo forests, arenas and sword tombs',
    palette: 'ink black, weathered gray, bamboo green, muted crimson and warm lantern gold',
    minions: [
      'a rough bandit swordsman in patched robe with broad saber',
      'a lean spear runner wearing a conical hat and streaming waist sash',
      'a hidden-weapon rogue with short cloak and fan of throwing darts',
    ],
    stages: [
      stage('酒馆街', 'rainy tavern lane, lanterns, wine jars and broken carts', '黑店掌柜', 'a heavy innkeeper fighter with iron abacus and cleaver', '酒旗刀王', 'a towering bandit chief carrying a banner-sized saber'),
      stage('竹林', 'dense bamboo, stepping stones and wind-cut leaves', '竹影镖头', 'an armored escort master with long spear and dart case', '青竹枪魁', 'a swift spear lord framed by a circular storm of bamboo leaves'),
      stage('擂台', 'weathered tournament platform, drums and torn school banners', '拳宗长老', 'an elderly barehanded master with oversized gauntlet aura', '八臂拳魔', 'a massive fighter whose afterimages form eight striking arms'),
      stage('江湖路', 'cliff road, courier posts and storm clouds', '暗器宗师', 'a masked master surrounded by a precise halo of needles', '无影楼主', 'a cloak-like assassin boss formed from layered shadow silhouettes'),
      stage('剑冢', 'graveyard of planted swords, stone steles and pale mist', '守冢剑奴', 'an elite blind swordsman with chained broken blades', '剑圣无名', 'a calm supreme swordsman in plain robes with an enormous spectral sword domain'),
    ],
  },
  {
    codex: 9, id: 'shanhai', name: '山海洪荒',
    world: 'a primeval mythic wilderness of colossal bones, ancient mountains and Chinese legendary beasts',
    palette: 'basalt black, moss green, bone cream, cinnabar red and turquoise spirit light',
    minions: [
      'a stocky horned beast cub with stone plates and tusks',
      'a winged raptor beast with tiger markings and a diving silhouette',
      'a squat venom toad monster with rune spots and inflated projectile throat',
    ],
    stages: [
      stage('蛮荒平原', 'wind-bent grass, giant rib bones and red standing stones', '荒原角王', 'a plated horned alpha beast with double tusks', '负山兽', 'a giant quadruped carrying a small mountain on its back'),
      stage('凶兽谷', 'narrow basalt valley, claw marks and fossil trees', '巨角兽', 'an enormous charging beast with crescent horns', '裂谷狰', 'a five-tailed predatory beast with stone claws and snarling mask face'),
      stage('穷奇岭', 'knife-edge ridge, storm banners and wing-shaped rocks', '穷奇', 'a fierce winged tiger with black-red mane and hooked claws', '吞风穷奇王', 'a much larger crowned winged tiger surrounded by compressed wind rings'),
      stage('洪荒战场', 'broken divine weapons, crater fields and ancient blood pools', '梼杌', 'a heavy boar-tiger monster with backward tusks and ground-slam posture', '兵灾兽祖', 'a scarred primordial chimera armored in embedded relic weapons'),
      stage('洪荒之主', 'cyclopean ritual basin and a dark devouring sun', '饕餮祭卫', 'an elite bronze-mask beast with a mouth on its torso', '饕餮', 'a colossal taotie with vast square jaws, curled horns and swallowing vortex belly'),
    ],
  },
  {
    codex: 10, id: 'jijia', name: '机甲战线',
    world: 'a devastated industrial warfront of armored factories, rail guns, hangars and missile smoke',
    palette: 'gunmetal, cold blue-gray, warning yellow, signal red and cyan reactor light',
    minions: [
      'a compact biped sentry robot with shielded head and rotary gun arm',
      'a low blade-wheel assault drone built for high-speed ramming',
      'a four-legged artillery walker with a long cyan-lit cannon',
    ],
    stages: [
      stage('钢铁防线', 'trenches, barricades, searchlights and anti-tank teeth', '防线指挥机', 'a broad command mech with antenna crown and shield projector', '城垒破坏者', 'a siege robot with twin pile drivers and bunker armor'),
      stage('兵工厂', 'assembly lines, cranes, ammunition racks and molten steel', '重装坦', 'a compact tracked elite tank with reactive plates', '铸造战争炉', 'a mobile furnace tank stamping out drone parts'),
      stage('装甲峡谷', 'wrecked convoys, canyon rails and towering gun emplacements', '峡谷猎坦', 'a fast reverse-jointed tank hunter with lance cannon', '轨道炮兽', 'a massive armored platform dominated by one rail gun barrel'),
      stage('机库', 'aircraft lifts, maintenance gantries and launch lights', '巡航机', 'a sharp-winged hovercraft with missile pods', '蜂巢母舰', 'a bulky low-altitude carrier releasing a cloud of mini drones'),
      stage('中枢', 'central reactor, armored data towers and shield rings', '零式近卫', 'a black prototype knight-mech with cyan blade', '零式', 'a towering prototype titan with missile crown, regenerative shield core and asymmetric heavy weapons'),
    ],
  },
  {
    codex: 11, id: 'jushen', name: '巨神界',
    world: 'a realm above the clouds built from titan ruins, cyclopean temples and mountain-sized statues',
    palette: 'cloud gray, granite blue, frost white, ancient bronze and ember red',
    minions: [
      'a broad giant eagle with stone-tipped wings and heavy talons',
      'a young stone giant leaning forward in a powerful charging run',
      'a one-eyed rock thrower carrying a cluster of glowing boulders',
    ],
    stages: [
      stage('云顶平原', 'cloud grass, floating menhirs and giant footprints', '雷羽巨鹰', 'an enormous armored eagle with lightning feathers', '云鲸吞陆者', 'a whale-like sky titan descending with a rocky underside'),
      stage('巨人谷', 'towering canyon walls, giant homes and boulder fields', '谷地石王', 'a thick stone giant with gate-shaped shield', '搬山巨人', 'a massive titan carrying a whole cliff as a weapon'),
      stage('泰坦遗迹', 'broken colossal statues, bronze chains and buried hands', '独眼巨人', 'a muscular cyclops with furnace eye and stone hammer', '遗迹苏醒者', 'a headless ancient titan animated by glowing runes'),
      stage('神域', 'frozen divine court, aurora pillars and enormous thrones', '霜巨人', 'a blue-white giant with ice beard and stomp aura', '冬冠神裔', 'a regal frost titan with antler crown and blizzard mantle'),
      stage('神山之巅', 'summit altar above all clouds and shattered celestial chains', '神山门卫', 'an elite bronze titan with ceremonial tower shield', '泰坦巨人', 'a mountain-sized primordial giant with glowing heart fissure and raised world-breaking fist'),
    ],
  },
  {
    codex: 12, id: 'zhutian', name: '诸天之心',
    world: 'the fractured heart of all worlds, combining broken portals, void crystal and echoes of every realm',
    palette: 'void black, pale silver, spectral cyan, fractured violet and restrained gold',
    minions: [
      'a compact fractured warrior echo assembled from mismatched world fragments',
      'a sharp void-rift beast stretched into a charging crescent silhouette',
      'a floating prismatic eye that fires shards from multiple realities',
    ],
    stages: [
      stage('万界回廊', 'interlocking portals showing fragments of all ten route worlds', '万界巡游者', 'an elite traveler wearing fused relics from every plane', '回廊吞门兽', 'a many-legged portal predator carrying rotating gateways'),
      stage('崩坏领域', 'cracked black ground, gravity tears and drifting architecture', '位面残影', 'a distorted composite of several earlier bosses', '裂界执政官', 'a tall faceless ruler holding a broken world sphere'),
      stage('诸天之心', 'radiant core chamber with twelve orbiting fragments', '自我镜像', 'a corrupted mirror of the pale nestling player with stolen route armor', '心核逆像', 'a giant inverse nestling silhouette surrounding a black cyan core'),
      stage('心之战', 'collapsing reality, repeated silhouettes and violent fracture lines', '崩坏使徒', 'an elite shadow with four incompatible weapon limbs', '崩坏之影', 'a monumental amorphous shadow wearing the crowns, horns and halos of all defeated rulers'),
      stage('归一终局', 'world fragments converging into one luminous horizon', '终焉守望', 'a final silver-black guardian with an hourglass core', '归一之灾', 'the final transformed collapse entity, a symmetrical cosmic predator around a cracked white heart'),
    ],
  },
];

export function findPlane(id) {
  return PLANES.find((plane) => plane.id === id) ?? null;
}

export function stageAtlasPath(planeId, stageNo) {
  return `atlases/stages/${planeId}_s${stageNo}.png`;
}

export function stageUnitPath(planeId, stageNo, slot) {
  return `units/${planeId}/s${stageNo}_${slot}.png`;
}

export function stageSheetPrompt(plane, stageInfo, stageNo) {
  return [
    'Use case: stylized-concept',
    'Asset type: production-ready 2D pixel game sprite atlas for deterministic automatic slicing',
    `World: ${plane.name}, ${plane.world}`,
    `Stage ${stageNo}/5: ${stageInfo.name}; ${stageInfo.motif}`,
    `Color palette: ${plane.palette}`,
    'Create EXACTLY ONE horizontal row of EXACTLY FIVE separate full-body enemy sprites on one canvas.',
    'The five equal-width slots, from left to right, are:',
    `1. WALKER MINION: ${plane.minions[0]}, modified by this stage motif.`,
    `2. CHARGER MINION: ${plane.minions[1]}, modified by this stage motif.`,
    `3. RANGED MINION: ${plane.minions[2]}, modified by this stage motif.`,
    `4. ELITE ${stageInfo.elite.name}: ${stageInfo.elite.look}.`,
    `5. BOSS ${stageInfo.boss.name}: ${stageInfo.boss.look}.`,
    'Style/medium: authentic hand-crafted 16-bit pixel art, hard 1-pixel clusters, limited 12-18 color palette, deep ink outline, no anti-aliased painterly edges, top-down three-quarter action-game view.',
    'Composition: every sprite faces right, stands on the same invisible baseline, is fully visible, centered inside its own equal-width slot, and has generous empty padding. Minions share one scale, elite is 20 percent larger, boss is 45 percent larger but must still fit entirely in slot five.',
    'Background: perfectly flat solid #FF00FF chroma key across the entire canvas.',
    'Constraints: no text, no labels, no numbers, no title, no borders, no grid lines, no scenery, no floor, no platform, no cast shadow, no contact shadow, no particles crossing slots, no repeated sprite, no merged characters, no watermark. Do not use magenta or pink in any character.',
    'The result must read as five isolated production sprites ready to cut into five vertical cells.',
  ].join('\n');
}

export function assertStageSpec() {
  if (PLANES.length !== 12) throw new Error(`Expected 12 planes, got ${PLANES.length}`);
  for (const plane of PLANES) {
    if (plane.minions.length !== 3) throw new Error(`${plane.id}: expected 3 minion archetypes`);
    if (plane.stages.length !== STAGE_COUNT) throw new Error(`${plane.id}: expected ${STAGE_COUNT} stages`);
  }
}

