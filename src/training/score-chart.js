// 得点推移の折れ線グラフ(インラインSVGの文字列)。reports.js の buildScoreSeries の結果をそのまま受け取る。
// 保存の出どころ(ブラウザ・サーバー)は知らない。色や線の太さは styles.css の .score-chart-* で決める。
import { escapeHtml } from "../shared/escape-html.js";

export const SCORE_CHART_TEXT = {
  empty: "完了した記録がまだありません。",
  yAxis: "正解数",
  xAxis: "実施回",
};

const WIDTH = 480;
const HEIGHT = 280;
const MARGIN = { left: 44, right: 20, top: 24, bottom: 44 };

const round = (value) => Math.round(value * 10) / 10;

// 縦軸の目盛り。0 から maxScore まで、およそ3等分(15なら 0・5・10・15)。
export function yTicks(maxScore) {
  const step = Math.max(1, Math.ceil(maxScore / 3));
  const ticks = [];
  for (let value = 0; value < maxScore; value += step) ticks.push(value);
  ticks.push(maxScore);
  return ticks;
}

// 点が多いときは、横軸の数字を間引く(最初と最後は必ず出す)。
function showXLabel(i, count) {
  const every = Math.ceil(count / 10);
  return i === 0 || i === count - 1 || i % every === 0;
}

export function buildScoreChartSvg(series) {
  const { points, maxScore } = series;
  if (points.length === 0) return `<p class="note">${SCORE_CHART_TEXT.empty}</p>`;

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xAt = (i) => round(MARGIN.left + (points.length === 1 ? plotWidth / 2 : (plotWidth * i) / (points.length - 1)));
  const yAt = (score) => round(MARGIN.top + plotHeight * (1 - Math.min(Math.max(score, 0), maxScore) / maxScore));

  const grid = yTicks(maxScore).map((tick) => `
    <line class="score-chart-grid" x1="${MARGIN.left}" y1="${yAt(tick)}" x2="${WIDTH - MARGIN.right}" y2="${yAt(tick)}"/>
    <text class="score-chart-label" x="${MARGIN.left - 8}" y="${yAt(tick)}" text-anchor="end" dominant-baseline="middle">${tick}</text>`).join("");

  const xLabels = points.map((point, i) => (showXLabel(i, points.length)
    ? `<text class="score-chart-label" x="${xAt(i)}" y="${HEIGHT - MARGIN.bottom + 18}" text-anchor="middle">${point.index}</text>`
    : "")).join("");

  const line = points.length > 1
    ? `<polyline class="score-chart-line" points="${points.map((point, i) => `${xAt(i)},${yAt(point.correctCount)}`).join(" ")}"/>`
    : "";

  // 点には値の文字を付ける(色だけに頼らない)。
  const dots = points.map((point, i) => `
    <circle class="score-chart-dot" cx="${xAt(i)}" cy="${yAt(point.correctCount)}" r="5"/>
    <text class="score-chart-value" x="${xAt(i)}" y="${round(yAt(point.correctCount) - 10)}" text-anchor="middle">${escapeHtml(String(point.correctCount))}</text>`).join("");

  const summary = `${points.length}回分の正解数: ${points.map((point) => `第${point.index}回 ${point.correctCount}`).join("、")}(満点 ${maxScore})`;

  return `<svg class="score-chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(summary)}">
    ${grid}
    <line class="score-chart-axis" x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${HEIGHT - MARGIN.bottom}"/>
    <line class="score-chart-axis" x1="${MARGIN.left}" y1="${HEIGHT - MARGIN.bottom}" x2="${WIDTH - MARGIN.right}" y2="${HEIGHT - MARGIN.bottom}"/>
    <text class="score-chart-label" x="4" y="${MARGIN.top - 8}" text-anchor="start">${SCORE_CHART_TEXT.yAxis}</text>
    <text class="score-chart-label" x="${WIDTH / 2}" y="${HEIGHT - 6}" text-anchor="middle">${SCORE_CHART_TEXT.xAxis}</text>
    ${xLabels}${line}${dots}
  </svg>`;
}
