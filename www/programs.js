/* Program text format (also used by the in-app editor)
 *
 *   == 1: Chest · Back · Power        <- workout key ":" focus
 *   # Chest                           <- group heading; add "(abs)" to count it toward the Abs habit
 *   Bench Press | 3x8                 <- name | sets  [| bw] [| note]
 *   Chin-Ups | 50 total | bw | As many as you can per set
 *   Deadlifts | 10,6,4 | Reps to failure
 *   == rest: Rest day                 <- optional: what shows on rest days
 *
 * Sets: "3x8", "5x25", "10,6,4", "50 total". Anything with no number gets the
 * program's default (3x8).
 */
(function (g) {
  "use strict";
  function slug(s) { return String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ex"; }

  function parseSets(spec, def) {
    spec = String(spec || "").trim().toLowerCase();
    var m;
    if ((m = spec.match(/^(\d+)\s*total$/))) return { total: +m[1], reps: [0, 0, 0, 0, 0] };
    if ((m = spec.match(/^(\d+)\s*[x×*]\s*(\d+)/))) { var a = []; for (var i = 0; i < Math.min(+m[1], 20); i++) a.push(+m[2]); return { reps: a }; }
    if (/^\d+(\s*,\s*\d+)+$/.test(spec)) return { reps: spec.split(",").map(function (x) { return +x.trim(); }) };
    if (/^\d+$/.test(spec)) return { reps: [+spec, +spec, +spec] };
    return null;
  }

  function parseProgram(text, opts) {
    opts = opts || {};
    var def = opts.defaultSets || "3x8";
    var workouts = {}, order = [], cur = null, grp = null, errors = [];
    String(text || "").split(/\r?\n/).forEach(function (raw, ln) {
      var line = raw.trim();
      if (!line || line.indexOf("//") === 0) return;
      var m;
      if ((m = line.match(/^==\s*([^:]+?)\s*(?::\s*(.*))?$/))) {
        var key = m[1].trim().toLowerCase() === "rest" ? "rest" : m[1].trim();
        cur = { key: key, focus: (m[2] || "").trim(), groups: [] };
        workouts[key] = cur; if (key !== "rest") order.push(key); grp = null; return;
      }
      if (!cur) { errors.push("Line " + (ln + 1) + ": start a workout with \"== 1: Focus\" first"); return; }
      if (line.charAt(0) === "#") {
        var name = line.replace(/^#+/, "").trim(), abs = /\(abs\)/i.test(name) || /^abdominals?$/i.test(name.replace(/\(abs\)/i, "").trim());
        grp = { g: name.replace(/\(abs\)/i, "").trim(), abs: abs, ex: [] }; cur.groups.push(grp); return;
      }
      if (!grp) { grp = { g: "Exercises", abs: false, ex: [] }; cur.groups.push(grp); }
      var parts = line.split("|").map(function (s) { return s.trim(); });
      var ex = { id: slug(parts[0]), n: parts[0], note: "", bw: false };
      var sets = null, notes = [];
      parts.slice(1).forEach(function (p) {
        if (!p) return;
        if (/^(bw|bodyweight)$/i.test(p)) { ex.bw = true; return; }
        var s = !sets && parseSets(p, def);
        if (s) { sets = s; return; }
        notes.push(p);
      });
      sets = sets || parseSets(def) || { reps: [8, 8, 8] };
      ex.reps = sets.reps; if (sets.total) { ex.total = sets.total; ex.bw = true; }
      ex.spec = parts[1] && parseSets(parts[1]) ? parts[1] : (sets.total ? sets.total + " total" : null);
      ex.note = notes.join(" · ");
      if (/to failure/i.test(ex.note)) ex.failure = true;
      grp.ex.push(ex);
    });
    if (!order.length) errors.push("No workouts found. Add at least one \"== 1: Focus\" line.");
    return { workouts: workouts, order: order, errors: errors };
  }

  var LEVEL1 = [
    "== 1: Chest · Back · Power",
    "# Chest",
    "Bench Press | 3x8",
    "Incline Press | 3x8",
    "Pullovers | 3x8",
    "# Back",
    "Chin-Ups | 50 total | bw | Do as many as you can at a time until you reach 50",
    "Bent-Over Rows | 3x8",
    "# Power Training",
    "Deadlifts | 10,6,4 | Reps to failure",
    "# Abdominals (abs)",
    "Crunches | 5x25 | bw",
    "",
    "== 2: Shoulders · Arms · Forearms",
    "# Shoulders",
    "Barbell Clean and Press | 3x8",
    "Dumbbell Lateral Raises | 3x8",
    "# Power Training",
    "Heavy Upright Rows | 10,6,4 | Reps to failure",
    "Push Presses | 6,4,2 | Reps to failure",
    "# Upper Arms",
    "Standing Barbell Curls | 3x8",
    "Seated Dumbbell Curls | 3x8",
    "Close-Grip Press | 3x8",
    "Standing Triceps Extensions with Barbell | 3x8",
    "# Forearms",
    "Wrist Curls | 3x8",
    "Reverse Wrist Curls | 3x8",
    "# Abdominals (abs)",
    "Reverse Crunches | 5x25 | bw",
    "",
    "== 3: Thighs · Calves · Lower Back",
    "# Thighs",
    "Squats | 3x8",
    "Lunges | 3x8",
    "Leg Curls | 3x8",
    "# Calves",
    "Standing Calf Raises | 5x15",
    "# Lower Back · Power Training",
    "Straight-Leg Deadlifts | 10,6,4 | Reps to failure",
    "Good Mornings | 10,6,4 | Reps to failure",
    "# Abdominals (abs)",
    "Crunches | 5x25 | bw",
    "",
    "== rest: Rest day — abs are still every day",
    "# Abdominals (abs)",
    "Crunches | 5x25 | bw"
  ].join("\n");

  var BUILTIN = [{
    id: "level-1",
    name: "Level I Basic Training",
    source: "Book: Level I Exercise Program",
    notes: "Abdominals every day. Where no reps are listed: 3 sets of 8.",
    builtin: true,
    defaultSets: "3x8",
    // Sun..Sat
    schedule: ["rest", "1", "2", "3", "1", "2", "3"],
    text: LEVEL1
  }, {
    id: "blank",
    name: "Blank template",
    source: "Start your own",
    notes: "Duplicate this and type in the next program from the book.",
    builtin: true,
    template: true,
    defaultSets: "3x8",
    schedule: ["rest", "1", "rest", "2", "rest", "1", "rest"],
    text: "== 1: Full body A\n# Main lifts\nSquats | 3x8\nBench Press | 3x8\n# Abdominals (abs)\nCrunches | 3x20 | bw\n\n== 2: Full body B\n# Main lifts\nDeadlifts | 3x5\nBent-Over Rows | 3x8\n# Abdominals (abs)\nReverse Crunches | 3x20 | bw\n"
  }];

  g.TL_PROGRAMS = { parseProgram: parseProgram, parseSets: parseSets, slug: slug, BUILTIN: BUILTIN };
})(window);
