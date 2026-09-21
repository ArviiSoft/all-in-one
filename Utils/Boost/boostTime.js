'use strict';

const MILESTONES = Object.freeze(
  [1, 2, 3, 6, 9, 12, 15, 18, 24].map((months, index) => Object.freeze({
    level: index + 1,
    months,
    thresholdMonths: index === 0 ? 0 : months,
  })),
);

function timestampOf(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).getTime() : NaN;
  if (typeof value === 'string' && value.trim()) return new Date(value).getTime();
  return NaN;
}

function addMonthsUTC(timestamp, months) {
  const time = timestampOf(timestamp);
  if (!Number.isFinite(time) || !Number.isSafeInteger(months)) return NaN;

  const date = new Date(time);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  if (!Number.isFinite(date.getTime())) return NaN;

  const monthEnd = new Date(date.getTime());
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return date.getTime();
}

function getMilestoneAt(startedAt, level) {
  const milestone = MILESTONES.find(item => item.level === level);
  if (!milestone) return null;
  const timestamp = addMonthsUTC(startedAt, milestone.thresholdMonths);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function durationParts(from, to) {
  const fromTime = timestampOf(from);
  const toTime = timestampOf(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  if (toTime <= fromTime) return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

  const start = new Date(fromTime);
  const end = new Date(toTime);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth();
  if (addMonthsUTC(fromTime, months) > toTime) months -= 1;
  let seconds = Math.floor((toTime - addMonthsUTC(fromTime, months)) / 1000);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return { months, days, hours, minutes, seconds };
}

function formatDuration(from, to) {
  const parts = durationParts(from, to);
  if (!parts) return '\u2014';
  const units = [['months', 'ay'], ['days', 'g'], ['hours', 'sa'], ['minutes', 'dk'], ['seconds', 'sn']];
  return units.filter(([key]) => parts[key] > 0)
    .map(([key, unit]) => `\`${parts[key]}${unit}\``).join(', ') || '`0sn`';
}

function getProgression(startedAt, now = Date.now()) {
  const startTime = timestampOf(startedAt);
  const nowTime = timestampOf(now);
  if (!Number.isFinite(startTime) || !Number.isFinite(nowTime) || startTime > nowTime) return null;

  let current = MILESTONES[0];
  for (const milestone of MILESTONES) {
    const milestoneAt = getMilestoneAt(startTime, milestone.level);
    if (milestoneAt !== null && milestoneAt <= nowTime) current = milestone;
    else break;
  }
  const next = MILESTONES[current.level] || null;
  const earnedAt = getMilestoneAt(startTime, current.level);
  const nextAt = next ? getMilestoneAt(startTime, next.level) : null;
  const progress = nextAt === null ? 1 : Math.max(0, Math.min(1, (nowTime - earnedAt) / (nextAt - earnedAt)));
  return {
    startedAt: startTime,
    level: current.level,
    current,
    next,
    earnedAt,
    nextAt,
    progress,
    elapsed: formatDuration(startTime, nowTime),
  };
}

module.exports = { MILESTONES, addMonthsUTC, getMilestoneAt, getProgression, durationParts, formatDuration };