/* ==========================================================================
   lib/knowledge-base.mjs — 명리학 지식베이스 (실험군 D/E 전용 입력)
   --------------------------------------------------------------------------
   왜 필요한가
     B(명식만)·C(명식+analysisData)까지는 '계산된 사실'만 받는다. 그 상태의 AI 는
     명리 개념을 자기 기억에서 꺼내 쓴다. D 는 그 자리에 **검증된 문장**을 넣어
     "문헌이 실제로 말한 것"과 "우리가 해석으로 붙인 것"과 "제품이 정한 규칙"을
     갈라 준다. E 는 이 지식베이스를 들고 D 의 초안을 비평·수정한다.

   표기 원칙 (docs/myeongri-literature-verification.md §1.2 를 그대로 잇는다)
     [문헌 확인]   원문에 그 문장이 있거나 원문 표에서 직접 읽힌다. quote 필수.
     [현대적 해석] 고전에 그 문장이 없다. 오늘의 언어로 옮긴 해석 관행이다.
     [제품 규약]   냥도사가 정한 계산·표기 규칙. 문헌 근거가 아니다.

   금지 (이 파일이 스스로 검사한다)
     · 신강·신약 점수화, 격국 단정, 용신 임의 판정을 '쓰는 법'으로 넣지 않는다.
     · 문헌 확인 항목에 quote 없이 원문이라고 쓰지 않는다.
     · 가중치·일수 같은 숫자는 [제품 규약] 또는 문헌이 적어 둔 서술로만 둔다.
   ========================================================================== */

export const KB_VERSION = 'kb/1.0';

export const KB_LABELS = {
  LIT: '문헌 확인',
  MODERN: '현대적 해석',
  PRODUCT: '제품 규약'
};

export const CATEGORIES = [
  { key: 'month', ko: '월령' },
  { key: 'hidden', ko: '지장간' },
  { key: 'roots', ko: '통근' },
  { key: 'geokguk', ko: '투출·격국' },
  { key: 'tenGods', ko: '십성' },
  { key: 'saenggeuk', ko: '생극제화' },
  { key: 'hapchong', ko: '합충' },
  { key: 'period', ko: '대운·세운' },
  { key: 'guard', ko: '해석 금지선' }
];

const LIT = KB_LABELS.LIT;
const MODERN = KB_LABELS.MODERN;
const PRODUCT = KB_LABELS.PRODUCT;

/* ==========================================================================
   항목
   ========================================================================== */

export const ENTRIES = [
  /* ---------------- 월령 ---------------- */
  {
    id: 'KB-MON-01',
    cat: 'month',
    title: '월령이 해석의 출발점이다',
    status: LIT,
    statement: '격과 용신을 논할 때 먼저 보는 자리가 월지(月令)다. 일간과 월지의 관계에서 생극이 갈리고, 그 갈림에서 격이 나온다.',
    source: {
      book: '자평진전', chapter: '論用神',
      quote: '八字用神，專求月令',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-yong-shen'
    },
    appliesTo: ['analysis.monthCommand', 'analysis.geokguk'],
    use: '월지 사실(지지·계절·월령 유형·본기 십성)을 먼저 말하고, 그다음에 다른 기둥을 본다.',
    guard: "월지를 '운명의 정답'으로 쓰지 않는다. 월지가 가리키는 후보가 둘 이상이면 둘 다 남긴다."
  },
  {
    id: 'KB-MON-02',
    cat: 'month',
    title: '잡기월은 글자가 많아 용신이 하나로 정해지지 않는다',
    status: LIT,
    statement: '辰·戌·丑·未(잡기월)는 지장간이 셋이라 用神 후보가 여럿이다. 문헌은 이 상태를 "잡(雜)하다"고 부르고, 하나를 고르라고 정해 주지 않는다.',
    source: {
      book: '자평진전', chapter: '論雜氣如何取用',
      quote: '四墓者，沖氣也，何以謂之雜氣？以其所藏者多，用神不一，故謂之雜氣也。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-za-qi-ru-he-qu-yong'
    },
    appliesTo: ['analysis.monthCommand.monthType', 'analysis.geokguk.candidates'],
    use: '잡기월이면 본기·투출·회국 후보를 나란히 두고, 어느 것이 정답이라고 하지 않는다.',
    guard: "잡기월에서 '본기 우선'을 규칙처럼 쓰지 않는다. 원문에 그런 서열 규정이 없다."
  },
  {
    id: 'KB-MON-03',
    cat: 'month',
    title: "월령은 '때'이고, 해석에서는 '그때의 환경'으로 옮긴다",
    status: MODERN,
    statement: '고전의 계절 기세(왕상휴수사)를 오늘의 언어로 옮기면 "태어난 계절의 환경", "그 환경이 나에게 무엇을 요구했는가"가 된다. 문헌에 이 문장이 있는 것은 아니다.',
    source: null,
    appliesTo: ['analysis.monthCommand.season', 'analysis.monthCommand.wangXiang'],
    use: "계절·월령 유형을 '환경' 비유로 옮겨 일상어로 설명한다. 예: 겨울 월지라면 '재료가 적은 계절에 시작한 사람'.",
    guard: '비유를 사실처럼 쓰지 않는다. 비유 뒤에는 반드시 그 근거가 된 사실(월지·계절)을 붙인다.'
  },
  {
    id: 'KB-MON-04',
    cat: 'month',
    title: '득령은 boolean 하나가 아니라 네 개의 독립 판독이다',
    status: PRODUCT,
    statement: '월지가 일간을 돕는지는 (1) 오행 생조 (2) 왕상휴수사 (3) 12운성 표 (4) 월지 본기 십성 — 네 축으로 따로 낸다. 네 값을 더하거나 평균하지 않는다.',
    source: null,
    appliesTo: ['analysis.deukryeong'],
    use: '네 판독이 서로 다른 방향을 가리킬 수 있다는 사실 자체를 문장의 재료로 쓴다.',
    guard: "'득령 2개 이상이면 신강' 같은 합산 규칙을 만들지 않는다. deukryeong.supported 같은 단일 boolean 으로 접지 않는다."
  },

  /* ---------------- 지장간 ---------------- */
  {
    id: 'KB-HID-01',
    cat: 'hidden',
    title: '지장간 표는 藏遁歌 계열을 쓴다',
    status: LIT,
    statement: '각 지지에 어떤 천간이 들어 있는지는 藏遁歌 표로 정한다. 子=癸, 丑=癸·辛·己, 寅=甲·丙·戊, 卯=乙, 辰=乙·戊·癸, 巳=丙·戊·庚, 午=丁·己, 未=乙·己·丁, 申=庚·壬·戊, 酉=辛, 戌=辛·丁·戊, 亥=壬·甲.',
    source: {
      book: '연해자평', chapter: '卷一 地支藏遁歌',
      quote: '子宫癸水在其中，丑癸辛金己土同，寅宫甲木兼丙戊，卯宫乙木独相逢，辰藏乙戊三分癸，巳中庚金丙戊丛，午宫丁火并己土，未宫乙己丁其宗，申位庚金壬水戊，酉宫辛字独丰隆，戌宫辛金及丁戊，亥中壬甲是真踪。',
      url: 'https://yuanhai.org/shuji/yuanhai-ziping/002-you-di-zhi-cang-dun-ge/'
    },
    appliesTo: ['analysis.hiddenStems'],
    use: '지장간은 "표면에 안 보이는 재료"로 설명한다. 통근·투출·십성 집계의 바탕이다.',
    guard: '표에 없는 글자를 지장간으로 말하지 않는다. 나열 순서를 정기 순서로 착각하지 않는다(藏遁歌는 순서가 정기 우선이 아니다).'
  },
  {
    id: 'KB-HID-02',
    cat: 'hidden',
    title: '午의 己土는 주류 표에 있지만 이견이 있다',
    status: LIT,
    statement: '午에 己를 넣는 것이 주류 표(藏遁歌)이고 『자평진전』도 그 전제로 논하지만, 같은 책이 子·午·卯·酉를 "藏이 하나인 지지"로 말하기도 하고 『삼명통회』 論人元司事 첫 방안에는 己가 없다.',
    source: {
      book: '자평진전', chapter: '論陽刃 / 論用神變化',
      quote: '其於丙生午月，內藏己土，可以剋水，尤宜帶財佩印 / 如十二支中，除子午卯酉外，餘皆有藏，不必四庫也。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-yang-ren'
    },
    appliesTo: ['analysis.hiddenStems', 'analysis.roots'],
    use: '午의 己를 근거로 쓸 때는 "표에 따라 己를 넣는 계통이 있다"는 수준으로 말한다.',
    guard: '己 하나로 격을 확정하거나, 午를 丁 단독 지지로 단정하지 않는다.'
  },
  {
    id: 'KB-HID-03',
    cat: 'hidden',
    title: '지장간 일수(月律分野)는 판정에 쓰지 않는다',
    status: LIT,
    statement: '생일이 절입 후 며칠째인지로 지장간 비중을 바꾸는 표가 있으나, 편찬자 자신이 일수 방식 자체를 부정했고 유파마다 값이 다르다.',
    source: {
      book: '삼명통회', chapter: '卷二 論人元司事',
      quote: '此五行生死進退之玄機，豈可以幾日爲限哉？…其說足以破淵源之誤。',
      url: 'https://www.shidianguji.com/zh/book/SK1610/chapter/1kf5v6o9by5o3'
    },
    appliesTo: ['analysis.earlyQiCandidates', 'analysis.monthCommand.daysFromTerm'],
    use: '참고값으로만 남긴다. 문장에서는 "그런 표도 있다" 정도로만 언급한다.',
    guard: '절입 후 일수로 지장간 비중·격·강약을 바꾸지 않는다.'
  },
  {
    id: 'KB-HID-04',
    cat: 'hidden',
    title: '지장간 가중치 100 / 70·30 / 60·30·10 은 제품 규약이다',
    status: PRODUCT,
    statement: '냥도사가 지장간 비중을 정할 때 쓰는 값이다. 어느 문헌에도 없는 제품 규약이며 analysisData 에 hiddenWeights: product/1 로 라벨이 붙는다.',
    source: null,
    appliesTo: ['analysis.hiddenStems[].entries[].weight', 'chart.weighted'],
    use: '화면·문장에서 비중을 말할 때 "제품 기준"임을 밝힌다.',
    guard: '가중치를 문헌 근거처럼 말하지 않는다. 가중 합으로 강약을 판정하지 않는다.'
  },

  /* ---------------- 통근 ---------------- */
  {
    id: 'KB-ROOT-01',
    cat: 'roots',
    title: '통근은 두 단계(重·輕)로만 나눈다',
    status: LIT,
    statement: '일간과 같은 오행의 글자가 지지에 있으면 뿌리(通根)다. 長生·祿·旺 자리의 뿌리는 무겁고, 墓庫·餘氣의 뿌리는 가볍다. 기둥에 글자가 많은 것보다 뿌리가 있는 것이 중요하다.',
    source: {
      book: '적천수천미', chapter: '衰旺 (任鐵樵 注)',
      quote: '是故日干不論月令休囚，只要四柱有根，便能受財官食神而當傷官七殺。長生祿旺，根之重者也；墓庫餘氣，根之輕者也。',
      url: 'https://guoxue3000.com/books/378/chapters/20'
    },
    appliesTo: ['analysis.roots', 'analysis.deukji.rootGrade'],
    use: '뿌리의 유무와 경중을 "버티는 힘"의 재료로 쓴다. 뿌리가 하나도 없다는 사실은 그 자체로 문장이 된다.',
    guard: '뿌리 개수를 점수로 합산하지 않는다. 문헌이 준 두 단계(중·경) 밖의 등급을 만들지 않는다.'
  },
  {
    id: 'KB-ROOT-02',
    cat: 'roots',
    title: '통근과 득지는 다른 축이다',
    status: PRODUCT,
    statement: '통근은 "일간과 같은 오행이 지지에 있는가", 득지는 "일지가 일간을 돕는가"다. 일지에 뿌리가 있어도 득지 판독은 아닐 수 있고, 그 반대도 있다.',
    source: null,
    appliesTo: ['analysis.roots', 'analysis.deukji'],
    use: '두 축이 어긋나는 명식에서는 어긋남을 그대로 말한다.',
    guard: '득지 판독을 통근으로 대신하지 않는다. rootGrade 를 득지 판정으로 쓰지 않는다.'
  },
  {
    id: 'KB-ROOT-03',
    cat: 'roots',
    title: "통근을 오늘의 언어로 옮기면 '기반'이다",
    status: MODERN,
    statement: '뿌리는 "힘을 받아 주는 바닥"으로 읽는다. 같은 오행이 지지에 있다는 것은 그 기질을 실제 생활에서 반복해서 쓰는 자리가 있다는 뜻으로 옮길 수 있다.',
    source: null,
    appliesTo: ['analysis.roots'],
    use: "뿌리 유무를 '기반이 있는가', '혼자 밀어붙이는가' 같은 생활 언어로 설명한다.",
    guard: "'뿌리가 없으니 불행하다' 같은 길흉 판정으로 넘어가지 않는다."
  },

  /* ---------------- 투출·격국 ---------------- */
  {
    id: 'KB-GEOK-01',
    cat: 'geokguk',
    title: '투출은 월지 지장간의 글자가 천간에 나온 것이다',
    status: LIT,
    statement: '격을 세우는 透出 은 월지 지장간의 글자가 年·月·時干에 나타난 것이다. 지지에 같은 글자가 또 있는 것은 透出이 아니라 通根·중복이다.',
    source: {
      book: '자평진전', chapter: '論雜氣如何取用',
      quote: '何謂透干？如甲生辰月，透戊則用偏財，透癸則用正印，透乙則用月劫是也。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-za-qi-ru-he-qu-yong'
    },
    appliesTo: ['analysis.geokguk.candidates[].transparent'],
    use: '투출 후보는 "월지의 재료가 겉으로 드러난 것"으로 설명한다.',
    guard: '다른 지지의 지장간이 천간에 나온 것을 격의 투출로 말하지 않는다(그것은 통근·십성 사실이다).'
  },
  {
    id: 'KB-GEOK-02',
    cat: 'geokguk',
    title: '둘이 투출하면 둘을 함께 쓴다 (兼透則兼用)',
    status: LIT,
    statement: '투출이 하나면 하나를 쓰고, 둘이면 둘을 함께 쓴다. 투출과 회국이 겹치면 둘을 함께 본다. "하나만 고른다"는 규칙은 원문에 없다.',
    source: {
      book: '자평진전', chapter: '論雜氣如何取用',
      quote: '一透則一用，兼透則兼用，透而又會，則透與會並用。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-za-qi-ru-he-qu-yong'
    },
    appliesTo: ['analysis.geokguk.candidates', 'analysis.geokguk.agreement'],
    use: '투출 후보가 둘이면 둘 다 문장에 올린다.',
    guard: '본기에 가깝다는 이유로 하나만 남기지 않는다.'
  },
  {
    id: 'KB-GEOK-03',
    cat: 'geokguk',
    title: '회국(會支)도 격의 재료이고, 삼합은 투출보다 앞설 수 있다',
    status: LIT,
    statement: '지지 두 글자만으로 성립한 반합도 회국 후보가 된다. 『자평진전』은 삼합이 성립하면 투출보다 먼저 격을 바꾼다고 서술한다(삼명통회는 투출을 먼저 본다 — 이견).',
    source: {
      book: '자평진전', chapter: '論雜氣如何取用 / 論用神變化',
      quote: '何謂會支？如甲生辰月，逢申與子會局，則用水印是也。 / 蓋寅午戌三合變化在前',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-yong-shen-bian-hua'
    },
    appliesTo: ['analysis.geokguk.candidates[].id GEOK.HOEJUK.*', 'analysis.hapchong[].kind 삼합·반합'],
    use: '회국 후보를 본기·투출 후보와 나란히 둔다.',
    guard: "회국 후보를 '진짜 격'으로 확정하지 않는다. 두 문헌의 순서 차이를 정답처럼 말하지 않는다."
  },
  {
    id: 'KB-GEOK-04',
    cat: 'geokguk',
    title: '건록·월겁은 용신이 월령에 없는 격이다',
    status: LIT,
    statement: '월지가 일간의 祿 또는 劫財 자리면 월령 자체가 用神이 되지 못한다. 그래서 財官食의 투출·회국에서 용신을 따로 찾는다. 음양간 모두 성립하고, 월령 기준이다.',
    source: {
      book: '자평진전', chapter: '論建祿月劫 / 論用神',
      quote: '建祿者，月建逢祿堂也，祿即是劫。…故建祿與月劫，可同一格，不必加分，皆以透干支，別取財官煞食爲用。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-jian-lu-yue-jie'
    },
    appliesTo: ['analysis.geokguk.candidates[].id GEOK.LU.*'],
    use: '월지가 祿이면 "월지가 나와 같은 편이라, 다른 기둥에서 쓸 재료를 찾는 구조"로 설명한다.',
    guard: "건록격이라는 이름만으로 '재물격' 같은 해석을 붙이지 않는다."
  },
  {
    id: 'KB-GEOK-05',
    cat: 'geokguk',
    title: '양인은 오양간·월령에만 성립한다',
    status: LIT,
    statement: '祿 앞 한 자리(帝旺)가 刃이다. 甲卯·丙午·戊午·庚酉·壬子 다섯 조합뿐이고, 음간의 겁재월은 양인이 아니라 월겁격이다. 日刃·時刃은 별도 사실로 둔다.',
    source: {
      book: '자평진전', chapter: '論陽刃 (徐樂吾 評註)',
      quote: '祿前一位，惟五陽有之 / 若非卯月而干透乙，或年日時支爲卯，則應名之爲劫而不名爲刃',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-yang-ren'
    },
    appliesTo: ['analysis.geokguk.candidates[].id GEOK.REN.*'],
    use: '양인 후보가 있으면 "제압·전화하는 재료가 무엇인지"를 함께 본다.',
    guard: "겁재를 곧바로 '양인격'으로 매핑하지 않는다(乙寅·丁巳·辛申·癸亥·己辰에서 틀린다)."
  },
  {
    id: 'KB-GEOK-06',
    cat: 'geokguk',
    title: '충으로 고를 연다 — 문헌이 정면으로 갈린다',
    status: LIT,
    statement: '『삼명통회』는 庫를 沖해야 發한다고 하고, 『자평진전』은 그 설을 "속서가 성대하게 말하는 것"이라며 부정한다. 어느 쪽도 정설이라고 말할 수 없다.',
    source: {
      book: '자평진전', chapter: '論墓庫刑沖之說',
      quote: '此說雖俗書盛稱之，然子平先生造命，無是說也 / 是故四墓不忌刑沖，刑沖未必成格',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-mu-ku-xing-chong-zhi-shuo'
    },
    appliesTo: ['analysis.hapchong', 'analysis.geokguk.unresolved'],
    use: '충이 잡기월의 庫에 걸려 있으면 "해석이 갈리는 자리"라고 표시하고 한쪽으로 단정하지 않는다.',
    guard: "'충하면 격이 열린다'를 판정으로 만들지 않는다."
  },
  {
    id: 'KB-GEOK-07',
    cat: 'geokguk',
    title: '격은 후보다. 확정하지 않는다',
    status: PRODUCT,
    statement: '냥도사는 격국 확정(정관격이다/식신격이다)을 하지 않는다. 본기·투출·회국·祿·刃 후보를 모두 내고 agreement(same/partial/differs/none)만 기록한다.',
    source: null,
    appliesTo: ['analysis.geokguk'],
    use: '후보가 여러 개면 "월지 하나에서도 여러 재료가 보인다"로 설명한다.',
    guard: "'○○격이다'라는 단정, 격명으로 성격을 규정하는 문장을 쓰지 않는다."
  },
  {
    id: 'KB-GEOK-08',
    cat: 'geokguk',
    title: "격은 '일하는 방식의 후보'로 읽는다",
    status: MODERN,
    statement: '격국을 오늘의 언어로 옮기면 "일에 들어가는 기본 방식의 후보"다. 후보가 둘이면 두 방식이 상황에 따라 번갈아 나온다고 읽는다.',
    source: null,
    appliesTo: ['analysis.geokguk'],
    use: '후보별로 "이 방식이 드러나는 장면"을 하나씩 붙여 일상어로 설명한다.',
    guard: "'격이 좋다/나쁘다'로 서열을 만들지 않는다."
  },

  /* ---------------- 십성 ---------------- */
  {
    id: 'KB-TEN-01',
    cat: 'tenGods',
    title: '십성 표 — 오행 생극 5관계 × 음양 같은가',
    status: PRODUCT,
    statement: '일간과 다른 글자의 오행 관계(같음·내가 낳음·내가 누름·나를 누름·나를 낳음)에 음양이 같은지를 곱해 열 개로 나눈다. 표 구현은 ten-gods/1.',
    source: null,
    appliesTo: ['chart.tenCount', 'analysis.tenGodFacts'],
    use: '십성 이름을 쓸 때는 바로 뒤에 생활 언어를 붙인다(예: 정관 = 나를 바르게 세우는 규칙).',
    guard: '표에 없는 십성을 말하지 않는다. 십성 하나로 사람 전체를 규정하지 않는다.'
  },
  {
    id: 'KB-TEN-02',
    cat: 'tenGods',
    title: '재관인식은 순용, 살상겁인은 역용',
    status: LIT,
    statement: '『자평진전』은 財·官·印·食을 순하게 쓰는 用神, 煞·傷·劫·刃을 제어해서 쓰는 用神으로 나눈다. 그래서 양인·월겁은 "무엇으로 제압·전화하는가"를 함께 봐야 한다.',
    source: {
      book: '자평진전', chapter: '論用神',
      quote: '財官印食，此用神之善而順用之者也；煞傷劫刃，用神之不善而逆用之者也。',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-yong-shen'
    },
    appliesTo: ['analysis.tenGodFacts', 'analysis.geokguk'],
    use: '역용 계열(편관·상관·겁재·양인)이 두드러지면 "그 힘을 무엇이 다스리는가"를 근거와 함께 말한다.',
    guard: "'역용이니 나쁘다'로 읽지 않는다. 제압·전화의 근거가 없으면 단정하지 않는다."
  },
  {
    id: 'KB-TEN-03',
    cat: 'tenGods',
    title: '십성 집계는 두 벌이고, 더하지 않는다',
    status: PRODUCT,
    statement: '표면 집계(천간+지지 본기)와 지장간 전체 집계는 다른 뷰다. analysisData 에 bySurface·byHiddenAll 로 따로 있고, 두 값을 합·평균하지 않는다.',
    source: null,
    appliesTo: ['analysis.tenGodFacts.bySurface', 'analysis.tenGodFacts.byHiddenAll'],
    use: '개수를 말할 때 어느 집계인지 밝힌다(예: "겉으로 보이는 글자에서는", "지장간까지 세면").',
    guard: '두 집계를 섞어 "정인이 4개"처럼 새 숫자를 만들지 않는다.'
  },
  {
    id: 'KB-TEN-04',
    cat: 'tenGods',
    title: '십성을 행동 양식으로 옮긴다',
    status: MODERN,
    statement: '비겁=동료·자기 몫, 식상=표현·생산, 재성=관리·성과·돈, 관성=규칙·책임·관계의 틀, 인성=배움·보호·받아들임. 고전의 십성 이름을 오늘의 행동으로 옮긴 해석 관행이다.',
    source: null,
    appliesTo: ['analysis.tenGodFacts', 'chart.tenCount'],
    use: '십성 이름만 나열하지 말고, 그 십성이 실제 행동으로 나타나는 장면을 하나 붙인다.',
    guard: '십성 → 성격 단정으로 넘어가지 않는다. 같은 십성도 자리(기둥)에 따라 다르게 쓰인다는 점을 남긴다.'
  },

  /* ---------------- 생극제화 ---------------- */
  {
    id: 'KB-SG-01',
    cat: 'saenggeuk',
    title: '생극은 글자 사이의 관계이고, 제화는 3자가 확인될 때만 사실이다',
    status: PRODUCT,
    statement: 'analysisData.saenggeuk 은 천간 사이·일간과 지지 사이의 生·剋만 기록한다. 剋하는 글자를 다시 제어하는 글자가 명식에 있으면 controlledBy 로 남긴다. 길흉 판정은 없다.',
    source: null,
    appliesTo: ['analysis.saenggeuk'],
    use: '제화가 확인되면 "압박을 다루는 세 번째 방식이 명식 안에 있다"로 설명한다.',
    guard: '제어 글자가 없는데 "제화된다"고 말하지 않는다. 생극을 좋다/나쁘다로 채점하지 않는다.'
  },
  {
    id: 'KB-SG-02',
    cat: 'saenggeuk',
    title: "제화는 '압박을 견디는 제3의 자리'로 읽는다",
    status: MODERN,
    statement: '나를 누르는 힘(극)과 그것을 다시 다스리는 힘(제)이 함께 있으면, 해석에서는 "압박이 와도 그것을 처리하는 자기만의 절차가 있다"로 옮긴다.',
    source: null,
    appliesTo: ['analysis.saenggeuk[].controlledBy'],
    use: "제화 관계를 '일이 터졌을 때 쓰는 순서' 같은 구체적 장면으로 풀어 쓴다.",
    guard: "제화가 있다고 '무조건 잘 풀린다'고 말하지 않는다(조건과 시기를 함께 말한다)."
  },

  /* ---------------- 합충 ---------------- */
  {
    id: 'KB-HAP-01',
    cat: 'hapchong',
    title: '합과 충은 서로를 없애지 않는다',
    status: LIT,
    statement: '『자평진전』은 투출·회국이 잘 되면 刑沖을 애쓸 필요가 없다고 말한다. 즉 沖은 合을 지우는 스위치가 아니고, 어느 쪽이 이겼다는 판정도 문헌이 주지 않는다.',
    source: {
      book: '자평진전', chapter: '論墓庫刑沖之說',
      quote: '夫雜氣透干會支，豈不甚美？又何勞刑沖乎？',
      url: 'https://www.kaucim.ai/bazi/ziping-zhenquan/lun-mu-ku-xing-chong-zhi-shuo'
    },
    appliesTo: ['analysis.hapchong'],
    use: '합과 충이 같이 있으면 둘 다 말하고, 어느 쪽이 이겼다고 하지 않는다.',
    guard: "'충이 합을 깼다' 같은 판정을 근거 없이 만들지 않는다."
  },
  {
    id: 'KB-HAP-02',
    cat: 'hapchong',
    title: '합화 성립은 판정하지 않는다',
    status: PRODUCT,
    statement: '천간합·육합·삼합·반합·충·형·파·해의 성립만 표(relation-set/1)로 기록한다. 合化 성립 여부는 decided:false 로 남기고 문장에서 확정하지 않는다.',
    source: null,
    appliesTo: ['analysis.hapchong[].decided'],
    use: '합이 있으면 "끌림·묶임"으로, 충이 있으면 "부딪힘·전환"으로 설명한다.',
    guard: "'합해서 ○○오행으로 변했다'고 말하지 않는다(transform.possible 까지만 사실)."
  },
  {
    id: 'KB-HAP-03',
    cat: 'hapchong',
    title: "합은 묶임, 충은 전환으로 읽는다",
    status: MODERN,
    statement: '합은 두 자리가 서로를 붙잡는 것, 충은 두 자리가 부딪히며 방향이 바뀌는 것으로 옮긴다. 이 비유는 문헌의 문장이 아니라 해석 관행이다.',
    source: null,
    appliesTo: ['analysis.hapchong'],
    use: '합·충이 걸린 기둥(년·월·일·시)에 따라 "관계의 어느 자리에서"인지 붙여 설명한다.',
    guard: '합·충을 길흉으로 등급화하지 않는다(합=좋음, 충=나쁨 금지).'
  },

  /* ---------------- 대운·세운 ---------------- */
  {
    id: 'KB-PER-01',
    cat: 'period',
    title: '세운은 입춘에 갈리고, 대운은 3일=1년으로 열린다',
    status: PRODUCT,
    statement: '세운은 1월 1일이 아니라 입춘 절입 순간에 바뀐다. 대운은 출생 시각과 절입 간격으로 3일=1년을 적용해 열리고, 성별·음양에 따라 순역이 갈린다. 구현은 period.js.',
    source: null,
    appliesTo: ['period.seun', 'period.daewoon', 'period.daewoonStart'],
    use: '올해 세운과 현재 대운을 "지금 지나는 구간"으로 설명한다.',
    guard: '조회 시점(asOf) 없이 "올해"를 말하지 않는다. 대운 시작 나이를 새로 계산하지 않는다.'
  },
  {
    id: 'KB-PER-02',
    cat: 'period',
    title: '대운은 간지 8자로 다시 계산할 수 없다',
    status: PRODUCT,
    statement: '대운은 생년월일·성별·절입 간격이 있어야 열리므로, 서버가 간지 8자만으로 재계산할 수 없다. 그래서 AI 는 대운·세운 값을 새로 만들지 않고 받은 값만 쓴다.',
    source: null,
    appliesTo: ['period.daewoon', 'period.nextDaewoon'],
    use: '받은 대운 간지·십성·나이 구간만 인용한다.',
    guard: '다음 대운의 간지를 추정해 쓰지 않는다. 세운·대운 글자와 명식 글자의 합·충을 새로 만들지 않는다(엔진이 계산하지 않는다).'
  },
  {
    id: 'KB-PER-03',
    cat: 'period',
    title: "대운은 천간(바깥 방식)과 지지(안 방식)로 나눠 읽는다",
    status: MODERN,
    statement: '대운 천간은 겉으로 드러나는 방식, 지지는 안에서 버티는 방식으로 옮겨 읽는 관행이 있다. 천간과 지지의 십성이 다르면 한 구간에 두 방식이 겹친다.',
    source: null,
    appliesTo: ['period.daewoon.stemTen', 'period.daewoon.branchTen'],
    use: '천간·지지 십성이 다르면 "밖에서는 A처럼, 안에서는 B처럼"으로 구분해 설명한다.',
    guard: '이 구분을 문헌의 규정처럼 말하지 않는다. 같은 십성이면 하나의 방식으로 설명한다.'
  },
  {
    id: 'KB-PER-04',
    cat: 'period',
    title: '세운·대운과 명식의 상호작용은 조건으로만 말한다',
    status: MODERN,
    statement: '세운·대운이 명식의 글자와 만나 합·충을 이루는지에 대한 정밀한 규정은 문헌마다 다르고, 냥도사 엔진도 그것을 계산하지 않는다. 그래서 "이 구간에 무엇이 걸린다"는 조건부 문장으로만 말한다.',
    source: null,
    appliesTo: ['period.seun', 'period.daewoon'],
    use: '"이 구간에는 ○○한 방식이 반복되기 쉽다"처럼 경향·조건으로 쓴다.',
    guard: '합·충을 새로 지어내지 않는다. 시기를 확정하지 않는다(반드시·올해 안에 금지).'
  },

  /* ---------------- 해석 금지선 ---------------- */
  {
    id: 'KB-GUARD-01',
    cat: 'guard',
    title: '신강신약 점수·격국 단정·용신 임의 판정은 만들지 않는다',
    status: PRODUCT,
    statement: '문헌·규칙 근거 없이 임의의 가중치나 점수 체계를 정설처럼 적용하지 않는다(사용자 지시 2026-11-25). analysisData 에 verdict·strength·score·total 키가 없고, 린트가 이를 거부한다.',
    source: null,
    appliesTo: ['analysis'],
    use: '강약은 "어느 축이 어떻게 읽히는가"로만 말한다.',
    guard: "신강·신약·용신·희신·격국 확정 단어를 판정으로 쓰지 않는다. '점수', '확률', '%' 를 만들지 않는다."
  },
  {
    id: 'KB-GUARD-02',
    cat: 'guard',
    title: '문헌은 후보 사이의 1순위를 정해 주지 않는다',
    status: LIT,
    statement: '투출을 먼저 본다는 설(연해자평·삼명통회)과 삼합이 앞선다는 설(자평진전)이 함께 있다. 문헌이 정해 주는 것은 "무엇을 함께 보는가"뿐이다.',
    source: {
      book: '연해자평', chapter: '卷五 雜氣財官詩訣 / 자평진전 論用神變化',
      quote: '干頭透出格爲眞 / 蓋寅午戌三合變化在前',
      url: 'https://sajumania.com/ebook/to01-06/to01-06-05-15.htm'
    },
    appliesTo: ['analysis.geokguk'],
    use: '후보가 여럿이면 "해석이 갈리는 자리"라고 밝히고 후보를 나란히 둔다.',
    guard: "'본기 우선', '투출 1순위' 같은 서열을 정설로 말하지 않는다."
  },
  {
    id: 'KB-GUARD-03',
    cat: 'guard',
    title: '누구에게나 맞는 문장은 해석이 아니다',
    status: PRODUCT,
    statement: '어떤 명식에도 붙일 수 있는 문장(바넘 문장)은 개인화가 아니다. 냥도사는 문단마다 그 사람의 사실(간지·십성·지장간·관계·구간)을 최소 하나 붙인다.',
    source: null,
    appliesTo: ['doc.paragraphs'],
    use: '문장을 쓰기 전에 "이 문장이 다른 명식에도 그대로 맞는가"를 확인한다.',
    guard: '근거 없는 위로·일반론으로 문단을 채우지 않는다.'
  }
];

/* ==========================================================================
   조회·출력 도우미
   ========================================================================== */

export const KB_BY_ID = ENTRIES.reduce((o, e) => { o[e.id] = e; return o; }, {});

export function entriesByCat(cat) {
  return ENTRIES.filter((e) => e.cat === cat);
}

export function entriesByStatus(status) {
  return ENTRIES.filter((e) => e.status === status);
}

export function getEntry(id) {
  return KB_BY_ID[id] || null;
}

/* facts.mjs evidencePool 이 kb.<id> 를 만들 때 쓰는 형태 */
export const KB_EVIDENCE = ENTRIES.map((e) => ({ id: e.id, title: e.title, status: e.status, cat: e.cat }));

/* 프롬프트에 넣을 압축 블록. 길이를 줄이려 인용은 첫 문장만 남긴다. */
export function kbPromptBlock(opts) {
  const o = opts || {};
  const only = o.ids || null;
  const list = only ? only.map(getEntry).filter(Boolean) : ENTRIES;
  const byCat = {};
  list.forEach((e) => { (byCat[e.cat] = byCat[e.cat] || []).push(e); });
  const lines = [];
  CATEGORIES.forEach((c) => {
    const es = byCat[c.key] || [];
    if (!es.length) return;
    lines.push('## ' + c.ko);
    es.forEach((e) => {
      lines.push('[' + e.id + '] (' + e.status + ') ' + e.title);
      lines.push('  - 내용: ' + e.statement);
      if (e.source) lines.push('  - 근거: 『' + e.source.book + '』 ' + e.source.chapter + ' 「' + e.source.quote + '」');
      lines.push('  - 쓰는 법: ' + e.use);
      lines.push('  - 금지: ' + e.guard);
    });
  });
  return lines.join('\n');
}

/* ==========================================================================
   자기검사 — 지식베이스가 스스로 규칙을 지켰는가
   ========================================================================== */

const STATUSES = [LIT, MODERN, PRODUCT];
const REQUIRED = ['id', 'cat', 'title', 'status', 'statement', 'appliesTo', 'use', 'guard'];
/* '쓰는 법'에 판정을 넣으면 안 된다. guard 문장은 금지 설명이므로 예외. */
const VERDICT_WORDS = ['신강', '신약', '용신', '희신', '격국 확정', '점수화'];

export function validateKB(entries) {
  const list = entries || ENTRIES;
  const problems = [];
  const seen = new Set();
  list.forEach((e) => {
    REQUIRED.forEach((k) => {
      if (e[k] === undefined || e[k] === null || (Array.isArray(e[k]) && !e[k].length) || e[k] === '') {
        problems.push((e.id || '?') + ' 필수 필드 없음: ' + k);
      }
    });
    if (seen.has(e.id)) problems.push('중복 id: ' + e.id);
    seen.add(e.id);
    if (STATUSES.indexOf(e.status) < 0) problems.push((e.id || '?') + ' 알 수 없는 표기: ' + e.status);
    if (!CATEGORIES.some((c) => c.key === e.cat)) problems.push((e.id || '?') + ' 알 수 없는 분류: ' + e.cat);
    if (e.status === LIT) {
      if (!e.source || !e.source.book || !e.source.chapter || !e.source.quote) problems.push(e.id + ' 문헌 확인인데 원문 인용 없음');
      if (e.source && e.source.quote && e.source.quote.length < 8) problems.push(e.id + ' 인용이 너무 짧음');
    }
    if (e.status !== LIT && e.source) problems.push(e.id + ' 문헌 확인이 아닌데 source 가 있음');
    if (e.status === PRODUCT && e.source) problems.push(e.id + ' 제품 규약에 문헌 출처가 붙음');
    VERDICT_WORDS.forEach((w) => {
      if (String(e.use).indexOf(w) >= 0) problems.push(e.id + " '쓰는 법'에 판정어: " + w);
    });
    if (/\d+\s*점|점수\s*합|총점/.test(String(e.use) + String(e.statement))) problems.push(e.id + ' 점수 표현');
  });
  /* 세 표기가 모두 최소 1개씩 있는가 — '명확히 구분'의 최소 조건 */
  STATUSES.forEach((s) => { if (!list.some((e) => e.status === s)) problems.push('표기 누락: ' + s); });
  return problems;
}

export function kbStats(entries) {
  const list = entries || ENTRIES;
  const by = {};
  STATUSES.forEach((s) => { by[s] = list.filter((e) => e.status === s).length; });
  const cats = {};
  CATEGORIES.forEach((c) => { cats[c.key] = list.filter((e) => e.cat === c.key).length; });
  return { total: list.length, byStatus: by, byCat: cats, version: KB_VERSION };
}

/* run.mjs 의 D 입력으로 넘길 항목 묶음 */
export function kbForArm(armKey) {
  if (armKey === 'D' || armKey === 'E') return ENTRIES;
  return [];
}
