(function() {

  function getSkillBonus(skill, stats, type) {
    if (!skill) return;
    type = (type || "buffs");
    var info = DiabloCalc.skills[DiabloCalc.charClass][skill[0]];
    var cur = null;
    if (info && info[type]) {
      if (typeof info[type] == "function") {
        cur = info[type](skill[1], stats);
      } else {
        cur = info[type][skill[1]];
      }
    }
    return cur;
  }
  DiabloCalc.getSkillBonus = getSkillBonus;

  function getPassiveBonus(passive, stats) {
    var info = DiabloCalc.passives[DiabloCalc.charClass][passive];
    var cur = null;
    if (info && info.buffs) {
      if (typeof info.buffs == "function") {
        cur = info.buffs(stats);
      } else {
        cur = info.buffs;
      }
    }
    return cur;
  }
  DiabloCalc.getPassiveBonus = getPassiveBonus;

  function execString(expr, stats, affix, params) {
    if (!expr) return 0;
    if (typeof expr != "string") return expr;
    if (affix) {
      expr = expr.replace(/\$([1-9])/g, function(m, index) {
        return stats.affixes[affix].value[parseInt(index) - 1];
      });
    } else if (params) {
      expr = expr.replace(/\$([1-9])/g, function(m, index) {
        return params[parseInt(index) - 1].val;
      });
    }
    return stats.execString(expr);
  }
  var glob_execString = execString;

  function formatObject(fmt, options) {
    options = options || {};
    var stats = DiabloCalc.getStats();
    function execString(expr) {
      return glob_execString(expr, stats, options.affix, options.params);
    }

    var base, avg;
    if (fmt.weapon) {
      if (!stats.info[fmt.weapon]) return;
      base = $.extend({}, stats.info[fmt.weapon].wpnbase);
      avg = (base.min + base.max) * 0.5;
    } else {
      base = $.extend({}, stats.info.mainhand.wpnbase);
      avg = (base.min + base.max) * 0.5;
      if (stats.info.offhand) {
        base.min = Math.min(base.min, stats.info.offhand.wpnbase.min);
        base.max = Math.max(base.max, stats.info.offhand.wpnbase.max);
        avg = avg * 0.5 + (stats.info.offhand.wpnbase.min + stats.info.offhand.wpnbase.max) * 0.25;
      }
    }

    var total_coeff = 1;
    var extra_coeff = 0;

    var factors = [];
    // primary attribute
    factors.push({
      name: DiabloCalc.stats[DiabloCalc.classes[DiabloCalc.charClass].primary].name,
      percent: stats.info.primary,
    });
    // attack speed scaling
    if (fmt.aps) {
      factors.push({
        name: "Attack speed",
        factor: (fmt.weapon ? stats.info[fmt.weapon].speed : stats.info.aps) * (fmt.aps === true ? 1 : execString(fmt.aps)),
      });
    }
    // skill multiplier
    if (fmt.coeff || fmt.addcoeff) {
      var coeff = (fmt.coeff ? execString(fmt.coeff) : 0);
      var basec = coeff;
      var addcoeff = undefined;
      total_coeff = coeff;
      if (fmt.addcoeff) {
        addcoeff = [];
        for (var i = 0; i < fmt.addcoeff.length; ++i) {
          var cur = fmt.addcoeff[i];
          var curval;
          if (typeof cur === "object") {
            cur = [execString(cur[0]), execString(cur[1])];
            if (cur[0] && cur[1]) addcoeff.push([100 * cur[0], cur[1]]);
            curval = cur[0] * cur[1];
          } else {
            cur = execString(cur);
            if (cur) addcoeff.push(100 * cur);
            curval = cur;
          }
          if (typeof fmt.total !== "number" || i < fmt.total) {
            total_coeff += curval;
          } else {
            extra_coeff += curval;
          }
          coeff += curval;
        }
      }
      factors.push({
        name: "Skill multiplier",
        factor: coeff,
        percent: 100 * basec,
        extra: addcoeff,
        coeff: true,
      });
    }
    // multiplicative factors = x<Value>
    if (fmt.factors) {
      for (var f in fmt.factors) {
        var value = execString(fmt.factors[f]);
        if (value != 1) {
          factors.push({
            name: f,
            factor: value,
          });
        }
      }
    }
    // multiplicative factor = /<Value>
    if (fmt.divide) {
      for (var f in fmt.divide) {
        var value = execString(fmt.divide[f]);
        if (value != 1) {
          factors.push({
            name: f,
            factor: 1 / value,
            divide: value,
          });
        }
      }
    }
    // multiplicative factor = +<Value>%
    if (fmt.percent) {
      for (var f in fmt.percent) {
        var value = execString(fmt.percent[f]);
        if (value) {
          factors.push({
            name: f,
            percent: value,
          });
        }
      }
    }
    // multiplicative passive = +<Value>%
    if (fmt.passives) {
      for (var p in fmt.passives) {
        if (stats.passives[p]) {
          var value = execString(fmt.passives[p]);
          if (value) {
            factors.push({
              name: DiabloCalc.passives[DiabloCalc.charClass][p].name,
              percent: value,
            });
          }
        }
      }
    }

    // additive bonuses
    var bonuses = {};
    // skill damage
    var skillid = (fmt.skill || (options.skill && options.skill[0]));
    if (skillid) {
      var bonus = stats["skill_" + DiabloCalc.charClass + "_" + skillid];
      if (bonus) {
        bonuses["Skill %"] = bonus;
      }
    }
    // additive bonuses
    if (fmt.bonuses) {
      for (var b in fmt.bonuses) {
        var value = execString(fmt.bonuses[b]);
        if (value) {
          bonuses[b] = value;
        }
      }
    }
    // additive passives - those should apply directly to skill damage
    if (fmt.addpassives) {
      for (var p in fmt.addpassives) {
        if (stats.passives[p]) {
          var value = execString(fmt.addpassives[p]);
          if (value) {
            bonuses[DiabloCalc.passives[DiabloCalc.charClass][p].name] = value;
          }
        }
      }
    }
    // for pets, these bonuses apply as a separate factor from DIBS
    if (fmt.pet && !$.isEmptyObject(bonuses)) {
      factors.push({
        name: "Skill damage",
        percent: bonuses,
      });
      bonuses = {};
    }

    var elem = (fmt.elem == "max" ? stats.info.maxelem : fmt.elem);
    // DIBS
    var tmp = stats.getTotalSpecial("damage", elem, fmt.pet, skillid, fmt.exclude);
    if (tmp) bonuses["Buffs"] = tmp;
    // debuffs
    var tmp = stats.getTotalSpecial("dmgtaken", elem, fmt.pet, skillid, fmt.exclude);
    if (tmp) bonuses["Debuffs"] = tmp;

    if (!$.isEmptyObject(bonuses)) {
      factors.push({
        name: (fmt.pet ? "Buffs/debuffs" : "Damage increased by skills"),
        percent: bonuses,
      });
    }

    // elemental/pet damage
    if ((elem && stats["dmg" + elem]) || (fmt.pet && stats.info.petdamage)) {
      var bonuses = {};
      if (elem && stats["dmg" + elem]) {
        bonuses[DiabloCalc.elements[elem]] = stats["dmg" + elem];
      }
      if (fmt.pet && stats.info.petdamage) {
        bonuses["Pets"] = stats.info.petdamage;
      }
      factors.push({
        name: "Elemental damage",
        percent: bonuses,
      });
    }

    // elite damage
    if (DiabloCalc.options.showElites && stats.edmg) {
      factors.push({
        name: "Damage against elites",
        percent: stats.edmg,
      });
    }

    // special damage
    var targetType = DiabloCalc.options.targetType;
    if (targetType && stats["damage_" + targetType]) {
      factors.push({
        name: "Damage against " + targetType,
        percent: stats["damage_" + targetType],
      });
    }

    // global multipliers
    $.each(stats.getSpecial("dmgmul", elem, fmt.pet, skillid, fmt.exclude), function(i, val) {
      factors.push({
        name: val[0],
        percent: val[1],
      });
    });

    var total_factor = 1;
    for (var i = 0; i < factors.length; ++i) {
      if (!factors[i].factor) {
        var percent = 0;
        if (typeof factors[i].percent === "number") {
          percent = factors[i].percent;
        } else {
          for (var k in factors[i].percent) {
            percent += factors[i].percent[k];
          }
        }
        factors[i].factor = 1 + 0.01 * percent;
      }
      total_factor *= factors[i].factor;
    }

    var bonus_chc = execString(fmt.chc);
    var bonus_chd = execString(fmt.chd);
    var chc = Math.min(1, 0.01 * (stats.final.chc + bonus_chc * (1 + 0.01 * (stats.chctaken_percent || 0))));
    var chd = 0.01 * (stats.chd + bonus_chd);

    var value = avg * total_factor * (1 + chc * chd);

    return {
      factors: factors,
      total_factor: total_factor * total_coeff / (total_coeff + extra_coeff),
      extra_factor: total_factor * extra_coeff / (total_coeff + extra_coeff),
      value: value,
      base: base,
      chc: chc,
      chd: chd,
      bonus_chc: bonus_chc,
    };
  }

  DiabloCalc.calcFrames = function(fpa, weapon, slowest, dspeed, method) {
    if (slowest !== true) {
      method = dspeed;
      dspeed = slowest;
      slowest = undefined;
    }
    var delta = (method === "up" ? 1 : 0);
    var stats = DiabloCalc.getStats();
    dspeed = (dspeed || 1);
    if (!weapon && stats.info.offhand) {
      if (slowest) {
        var basespeed = Math.min(stats.info.mainhand.speed, stats.info.offhand.speed);
        return Math.floor(fpa / (dspeed * basespeed)) + delta;
      } else {
        var framesmh = Math.floor(fpa / (dspeed * stats.info.mainhand.speed));
        var framesoh = Math.floor(fpa / (dspeed * stats.info.offhand.speed));
        return 0.5 * (framesmh + framesoh) + delta;
      }
    } else {
      var basespeed = stats.info[weapon || "mainhand"].speed;
      return Math.floor(fpa / (dspeed * basespeed)) + delta;
    }
  };

  function processInfo(lines, options) {
    var result = {};
    var sumlines = [];
    options = options || {};
    var stats = DiabloCalc.getStats();

    function fmtValue(val, decimal, clr, per) {
      var parts = ("" + parseFloat(val.toFixed(decimal || 0))).split(".");
      if (parseFloat(val) >= 10000) {
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }
      val = parts.join(".");
      return "<span class=\"d3-color-" + (clr || "green") + "\">" + val + (per || "") + "</span>";
    }
    function fmtRange(a, b, clr) {
      a = Math.floor(a);
      b = Math.floor(b);
      return fmtValue(a, 0, clr) + (a == b ? "" : "-" + fmtValue(b, 0, clr));
    }
    function fmtTip(tip) {
      if (!tip) return "";
      if (typeof tip === "string") {
        if (tip[0] === "@") return "<br/><span class=\"tooltip-icon-nobullet\"></span>" + tip.substring(1);
        else return "<br/><span class=\"tooltip-icon-bullet\"></span>" + tip;
      } else {
        var res = "";
        for (var i = 0; i < tip.length; ++i) {
          if (tip[i][0] === "@") res += "<br/><span class=\"tooltip-icon-nobullet\"></span>" + tip[i].substring(1);
          else res += "<br/><span class=\"tooltip-icon-bullet\"></span>" + tip[i];
        }
        return res;
      }
    }
    function tipHeader(name, value) {
      return "<div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"profile-tooltip\"><p><span class=\"d3-color-gold\">" + name +
             ": <span class=\"d3-color-green\">" + value + "</span></span>";
    }
    function execString(expr) {
      return glob_execString(expr, stats, options.affix, options.params);
    }

    $.each(lines, function(stat, fmt) {
      if (!fmt) return;
      result[stat] = {};
      if (typeof fmt !== "object") {
        result[stat].text = fmt;
      } else if (fmt.sum) {
        sumlines.push(stat);
      } else if (fmt.cooldown && fmt.duration) {
        var duration = execString(fmt.duration);
        var cooldown = execString(fmt.cooldown);
        var skill = fmt.skill || (options.skill && options.skill[0]);
        if (skill) {
          cooldown -= (stats["skill_" + DiabloCalc.charClass + "_" + skill + "_cooldown"] || 0);
        }
        if (fmt.cdr) {
          cooldown *= 1 - 0.01 * execString(fmt.cdr);
        }
        cooldown = Math.max(0.5, cooldown * (1 - 0.01 * (stats.cdr || 0)));

        var value;
        if (cooldown <= 0.01) {
          value = 100;
        } else {
          value = Math.min(100, 100 * duration / (cooldown + (fmt.after ? duration : 0)));
        }
        result[stat].value = value;
        result[stat].text = DiabloCalc.formatNumber(value, 0, 10000) + "%";

        var tip = tipHeader(stat, result[stat].text);
        tip += fmtTip(fmt.tip);
        tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Duration: " + fmtValue(duration, 0, "white") + " seconds";
        tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Cooldown: " + fmtValue(cooldown, 2, "white") + " seconds";
        tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Downtime: " + fmtValue(100 - value, 2, "white", "%");
        if (fmt.after) {
          tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Cooldown does not start until the effect expires.";
        } else {
          tip += " (" + fmtValue(Math.max(0, cooldown - duration), 2, "white") + " seconds)";
        }
        tip += "</p></div>";
        result[stat].tip = tip;
      } else if (fmt.cooldown) {
        var cooldown = execString(fmt.cooldown);
        var skill = fmt.skill || (options.skill && options.skill[0]);
        if (skill) {
          cooldown -= (stats["skill_" + DiabloCalc.charClass + "_" + skill + "_cooldown"] || 0);
        }
        if (fmt.cdr) {
          cooldown *= 1 - 0.01 * execString(fmt.cdr);
        }
        cooldown = Math.max(0.5, cooldown * (1 - 0.01 * (stats.cdr || 0)));
        result[stat].value = cooldown;
        result[stat].text = parseFloat(cooldown.toFixed(2)) + " seconds";
      } else if (fmt.cost) {
        var resource = (fmt.resource || DiabloCalc.classes[DiabloCalc.charClass].resources[0]);
        var cost = execString(fmt.cost) * (1 - 0.01 * (stats["rcr_" + resource] || 0));
        if (fmt.rcr) {
          cost *= 1 - 0.01 * execString(fmt.rcr);
        }
        if (options.skill && options.skill[0]) {
          var skill = DiabloCalc.skilltips[DiabloCalc.charClass][options.skill[0]];
          if (skill && skill.elements[options.skill[1]] === "fir") {
            cost *= 1 - 0.01 * (stats.leg_cindercoat || 0);
          }
        }
        var skillid = fmt.skill || (options.skill && options.skill[0]);
        if (skillid) {
          cost = Math.max(0, cost - (stats["skill_" + DiabloCalc.charClass + "_" + skillid + "_cost"] || 0));
        }
        cost = Math.max(0, cost - (stats.rcrint || 0));

        if (fmt.speed || fmt.fpa) {
          var dspeed = (execString(fmt.speed) || 1) * (1 + 0.01 * execString(fmt.ias));
          var aps, frames;
          if (fmt.fpa) {
            if (fmt.slowest) {
              frames = DiabloCalc.calcFrames(fmt.fpa, fmt.weapon, true, dspeed, fmt.round);
            } else {
              frames = DiabloCalc.calcFrames(fmt.fpa, fmt.weapon, dspeed, fmt.round);
            }
            aps = 60 / frames;
            cost *= fmt.fpa / 60;
          } else {
            aps = dspeed * (fmt.weapon ? stats.info[fmt.weapon].speed : stats.info.aps);
          }
          result[stat].value = cost * aps;
          result[stat].text = parseFloat((cost * aps).toFixed(2)) + " " + DiabloCalc.resources[resource] + " per second";
          if (fmt.fpa) {
            var tip = tipHeader(stat, result[stat].text);
            tip += fmtTip(fmt.tip);
            tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Cost per tick: " + fmtValue(cost, 2, "white") + " " + DiabloCalc.resources[resource];
            tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Breakpoint: " + frames + " frames (" + fmtValue(aps, 2, "white") + " APS)";
            tip += "</p></div>";
            result[stat].tip = tip;
          }
        } else {
          result[stat].value = cost;
          result[stat].text = parseFloat(cost.toFixed(2)) + " " + DiabloCalc.resources[resource];
        }
      } else if (fmt.value) {
        if (typeof fmt.value === "number") {
          result[stat].value = fmt.value;
          result[stat].text = DiabloCalc.formatNumber(fmt.value, 0, 10000);
        } else {
          result[stat].text = fmt.value;
        }
        if (fmt.tip) {
          result[stat].tip = tipHeader(stat, result[stat].text) + fmtTip(fmt.tip) + "</p></div>";
        }
      } else {
        var data = formatObject(fmt, options);
        if (!data) {
          delete result[stat];
          return;
        }
        result[stat].value = data.value;
        result[stat].text = DiabloCalc.formatNumber(data.value, 0, 10000);

        var tip = tipHeader((fmt.total === true ? "" : "Average ") + stat, result[stat].text);
        tip += fmtTip(fmt.tip);
        if (!fmt.weapon && stats.info.mainhand && stats.info.offhand) {
          tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Alternates weapons";
        }
        if (fmt.total !== true) {
          if (fmt.nocrit) {
            tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Damage range: " + fmtRange(data.base.min * data.total_factor * (1 + data.chc * data.chd), data.base.max * data.total_factor * (1 + data.chc * data.chd), "white");
          } else {
            if (!fmt.weapon && stats.info.mainhand && stats.info.offhand) {
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Mainhand white damage: " +
                fmtRange(stats.info.mainhand.wpnbase.min * data.total_factor, stats.info.mainhand.wpnbase.max * data.total_factor, "white");
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Offhand white damage: " +
                fmtRange(stats.info.offhand.wpnbase.min * data.total_factor, stats.info.offhand.wpnbase.max * data.total_factor, "white");
              if (data.bonus_chc) {
                tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Critical chance: " + fmtValue(data.chc * 100, 2, "green", "%");
              }
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Mainhand critical damage: " +
                fmtRange(stats.info.mainhand.wpnbase.min * data.total_factor * (1 + data.chd), stats.info.mainhand.wpnbase.max * data.total_factor * (1 + data.chd), "white");
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Offhand critical damage: " +
                fmtRange(stats.info.offhand.wpnbase.min * data.total_factor * (1 + data.chd), stats.info.offhand.wpnbase.max * data.total_factor * (1 + data.chd), "white");
            } else {
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>White damage: " + fmtRange(data.base.min * data.total_factor, data.base.max * data.total_factor, "white");
              if (data.bonus_chc) {
                tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Critical chance: " + fmtValue(data.chc * 100, 2, "green", "%");
              }
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Critical damage: " + fmtRange(data.base.min * data.total_factor * (1 + data.chd), data.base.max * data.total_factor * (1 + data.chd), "white");
            }
          }
        }
        if (typeof fmt.total === "number") {
          tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Extra damage: " + fmtValue(0.5 * (data.base.min + data.base.max) * data.extra_factor * (1 + data.chc * data.chd), 0, "white");
        }
        tip += "<br/><span class=\"tooltip-icon-bullet\"></span>Formula: <span class=\"d3-color-gray\">[Weapon]</span>";
        if (fmt.nocrit || fmt.total) {
          tip += " &#215; " + fmtValue(1 + data.chc * data.chd, 2);
        }
        for (var i = 0; i < data.factors.length; ++i) {
          if (data.factors[i].divide) {
            tip += " / " + fmtValue(data.factors[i].divide);
          } else {
            tip += " &#215; " + fmtValue(data.factors[i].factor, 2);
          }
        }
        if (fmt.weapon !== "offhand") {
          if (!fmt.avg) {
            tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Main hand damage: " + fmtRange(stats.info.mainhand.wpnbase.min, stats.info.mainhand.wpnbase.max, "white");
          } else {
            tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Average main hand damage: " + fmtValue(0.5 * (stats.info.mainhand.wpnbase.min + stats.info.mainhand.wpnbase.max), 0, "white");
          }
        }
        if (fmt.weapon !== "mainhand" && stats.info.offhand) {
          tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Off hand damage: " + fmtRange(stats.info.offhand.wpnbase.min, stats.info.offhand.wpnbase.max, "white");
        }
        if (fmt.nocrit || fmt.total) {
          tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Critical multiplier: " + fmtValue(1, 0, "white") + " + " +
            fmtValue(data.chc, 2, "green") + " &#215; " + fmtValue(data.chd, 2, "green");
        } else {
          tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Critical damage: " + fmtValue(100 * data.chd, 1, "white", "%");
        }
        for (var i = 0; i < data.factors.length; ++i) {
          var factor = data.factors[i];
          tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>" + factor.name + ": ";
          var first = " + ";
          if (factor.divide) {
            tip += fmtValue(1, 0, "white") + " / " + fmtValue(factor.divide);
          } else if (factor.percent !== undefined) {
            if (typeof factor.percent === "number") {
              if (factor.percent) {
                tip += fmtValue(factor.percent, 2, "green", "%");
              } else {
                first = "";
              }
            } else {
              var first = true;
              for (var f in factor.percent) {
                if (!first) {
                  tip += " + ";
                }
                first = false;
                tip += fmtValue(factor.percent[f], 2, "green", "%");
                tip += " <span class=\"d3-color-gray\">(" + f + ")</span>";
              }
            }
          } else {
            tip += fmtValue(factor.factor, 2);
          }
          if (factor.extra) {
            for (var j = 0; j < factor.extra.length; ++j) {
              if (typeof factor.extra[j] === "object") {
                tip += first + fmtValue(factor.extra[j][0], 2, "green", "%");
                tip += " &#215; " + fmtValue(factor.extra[j][1], 2, "green");
              } else {
                tip += first + fmtValue(factor.extra[j], 2, "green", "%");
              }
              first = " + ";
            }
          }
        }
        tip += "</p></div>";

        result[stat].tip = tip;
      }
    });

    var breakpointTip = "";
    var breakpointValues = [];
    var speedCache = {};
    while (sumlines.length) {
      var next = [];
      for (var index = 0; index < sumlines.length; ++index) {
        var stat = sumlines[index];
        var okay = true;
        var sum = 0;
        var tip = "";
        var bpTip = "";
        var bpValues = [];
        var sequence = (lines[stat].sum === "sequence");
        var totalTime = 0;
        $.each(lines[stat], function(src, data) {
          if (result[src] || (typeof data === "object" && src != "tip")) {
            var key = src;
            if (typeof data === "object" && src != "tip") {
              key = (data.src || src);
            }
            if ((!result[key] || result[key].value === undefined) && (typeof data !== "object" || !data.value)) {
              okay = false;
            } else {
              if (typeof data === "object") {
                data = $.extend({}, data);
              } else {
                data = {speed: data};
              }
              tip += "<br/><span class=\"tooltip-icon-bullet\"></span>" + (data.name || src) + ": ";
              var mul = 1;
              if (data.count) {
                data.count = execString(data.count);
                if (data.count && data.count != 1) {
                  mul *= data.count;
                  tip += parseFloat(data.count.toFixed(2)) + "x ";
                }
              }
              tip += fmtValue(data.value || result[key].value, 0, "white");
              if (data.factor) {
                data.factor = execString(data.factor);
                if (data.factor != 1) {
                  mul *= data.factor;
                  tip += " &#215; " + fmtValue(data.factor, 2, "white");
                }
              }
              if (data.divide) {
                data.divide = execString(data.divide);
                if (data.divide != 1) {
                  mul /= data.divide;
                  tip += " / " + fmtValue(data.divide, 0, "white");
                }
              }
              if (data.pet) {
                var frames = undefined;
                var aps = (data.speed ? execString(data.speed) * stats.info.mainhand.speed : (data.aps ? execString(data.aps) : 1));
                var petias = (stats.petias || 0);
                if (data.area === false) {
                  petias = (stats.leg_taskerandtheo || 0);
                }
                var tnt = 1 + 0.01 * execString(data.ias) + 0.01 * petias;
                aps *= tnt;
                if (typeof data.pet === "number") {
                  frames = Math.ceil(Math.floor(data.pet / aps) / 6) * 6;
                  aps = 60 / frames;
                }
                tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Speed: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(aps, 2, 10000) + "</span>";
                if (frames) {
                  tip += " (" + fmtValue(frames, 0, "white") + " frames)";
                  if (!data.nobp) {
                    bpValues.push(frames);
                    bpTip += "<br/><span class=\"tooltip-icon-bullet\"></span>" + (data.name || src) + ": " + fmtValue(frames, 0, "white") +
                      " frames (<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(aps, 2, 10000) + "</span> APS)";
                    if (data.speed) {
                      if (frames > 6) {
                        var next = data.pet / (frames - 5) / tnt + 0.00005;
                        //bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Next breakpoint: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(next, 4, 10000) + "</span>" +
                        //  " character APS (<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(data.pet / (frames - 5) + 0.00005, 4, 10000) + "</span> pet APS)";
                        //bpTip += " (<span class=\"d3-color-green\">+" + DiabloCalc.formatNumber(100 * (frames / (frames - 6) - 1), 1) + "%</span> DPS)";
                        if (data.speed) {
                          var basemh = stats.info.mainhand.speed / (1 + 0.01 * (stats.ias || 0));
                          var apsneed = data.pet / (frames - 5) / tnt / execString(data.speed);
                          var iasneed = Math.ceil((100 * apsneed / basemh - 100 - (stats.ias || 0)) * 10) / 10;
                          bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>IAS to next breakpoint: <span class=\"d3-color-white\">" + iasneed + "%</span>";
                        }
                      }
                      bpTip += "</p><table><tr><th>FPA</th><th>APS</th><th>Pet APS</th><th>Delta</th></tr>";
                      for (var curfpa = Math.ceil(Math.floor(data.pet) / 6) * 6; curfpa >= 6; curfpa -= 6) {
                        var curaps = Math.max(1, data.pet / (curfpa + 1) / tnt + 0.00005);
                        if (data.pet / (curfpa + 1) > 5) break;
                        bpTip += "<tr" + (curfpa === frames ? " class=\"current\"" : "") + "><td>" + curfpa + "</td>";
                        bpTip += "<td>" + curaps.toFixed(4) + "</td><td>" + Math.max(1, data.pet / (curfpa + 1) + 0.00005).toFixed(4) + "</td>";
                        var delta = 100 * (frames / curfpa - 1);
                        bpTip += "<td class=\"" + (delta < 0 ? "d3-color-red" : (delta > 0 ? "d3-color-green" : "d3-color-gray")) + "\">";
                        bpTip += (delta < 0 ? delta.toFixed(1) : "+" + delta.toFixed(1)) + "%</td></tr>";
                      }
                      bpTip += "</table><p>";
                      //var prev = data.pet / (frames + 1) / tnt - 0.00005;
                      //bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Previous breakpoint: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(prev, 4, 10000) + "</span>" +
                      //  " character APS (<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(data.pet / (frames + 1) - 0.00005, 4, 10000) + "</span> pet APS)";
                      //bpTip += " (<span class=\"d3-color-red\">-" + DiabloCalc.formatNumber(100 * (1 - frames / (frames + 6)), 1) + "%</span> DPS)";
                    }
                  }
                }
                if (sequence) {
                  totalTime += 1 / aps;
                } else {
                  mul *= aps;
                }
              } else if (data.speed || data.aps || data.fpa) {
                var aps = 1;
                var weapon;
                if (data.speed) {
                  weapon = (typeof lines[key] === "object" && lines[key].weapon);
                  dspeed = execString(data.speed);
                  aps = dspeed * (weapon ? stats.info[weapon].speed : stats.info.aps);
                } else if (data.aps) {
                  aps = execString(data.aps);
                }
                if (data.ias) {
                  var ias = 1 + 0.01 * execString(data.ias);
                  aps *= ias;
                  if (dspeed) dspeed *= ias;
                }
                var frames, framesmh, framesoh, basespeed, fpadelta;
                if (data.fpa) {
                  fpadelta = (data.round === "up" ? 1 : 0);
                  if (data.speed && !weapon && stats.info.offhand) {
                    if (data.slowest) {
                      basespeed = Math.min(stats.info.mainhand.speed, stats.info.offhand.speed);
                      frames = Math.floor(data.fpa / (dspeed * basespeed)) + fpadelta;
                    } else {
                      framesmh = Math.floor(data.fpa / (dspeed * stats.info.mainhand.speed));
                      framesoh = Math.floor(data.fpa / (dspeed * stats.info.offhand.speed));
                      frames = 0.5 * (framesmh + framesoh) + fpadelta;
                    }
                  } else {
                    frames = Math.floor(data.fpa / aps) + fpadelta;
                    basespeed = stats.info.mainhand.speed;
                  }
                  aps = 60 / frames;
                }
                function fpaDelta(nextmh, nextoh) {
                  var fpa;
                  if (framesmh && framesoh) {
                    fpa = 0.5 * (Math.floor(data.fpa / (dspeed * nextmh)) + Math.floor(data.fpa / (dspeed * nextoh))) + fpadelta;
                  } else {
                    fpa = Math.floor(data.fpa / (dspeed * nextmh)) + fpadelta;
                  }
                  if (fpa < frames) {
                    return " (<span class=\"d3-color-green\">+" + DiabloCalc.formatNumber(100 * (frames / fpa - 1), 1) + "%</span> DPS)";
                  } else if (fpa > frames) {
                    return " (<span class=\"d3-color-red\">-" + DiabloCalc.formatNumber(100 * (1 - frames / fpa), 1) + "%</span> DPS)";
                  } else {
                    return " (<span class=\"d3-color-gray\">+0%</span> DPS)";
                  }
                }
                tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Speed: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(aps, 2, 10000) + "</span>";
                if (frames) {
                  tip += " (" + fmtValue(frames, 1, "white") + " frames)";
                  if (!data.nobp) {
                    bpValues.push(frames);
                    bpTip += "<br/><span class=\"tooltip-icon-bullet\"></span>" + (data.name || src) + ": " + fmtValue(frames, 0, "white") +
                      " frames (<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(aps, 2, 10000) + "</span> APS)";
                    if (data.speed) {
                      if (framesmh && framesoh) {
                        if (framesmh > 1 && framesoh > 1) {
                          var nextmh = data.fpa / (framesmh - fpadelta) / dspeed + 0.00005;
                          var nextoh = data.fpa / (framesoh - fpadelta) / dspeed + 0.00005;
                          var next = Math.min(nextmh / stats.info.mainhand.speed, nextoh / stats.info.offhand.speed);
                          nextmh = next * stats.info.mainhand.speed;
                          nextoh = next * stats.info.offhand.speed;
                          bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Next breakpoint: <span class=\"d3-color-white\">" +
                            DiabloCalc.formatNumber(nextmh, 4, 10000) + "</span>/<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(nextoh, 4, 10000) + "</span> APS";
                          bpTip += fpaDelta(nextmh, nextoh);
                          if (data.speed) {
                            var iasneed = Math.ceil(10 * (next * (100 + (stats.ias || 0)) - 100 - (stats.ias || 0))) / 10;
                            bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>IAS to next breakpoint: <span class=\"d3-color-white\">" + iasneed + "%</span>";
                          }
                        }
                        var prevmh = data.fpa / (framesmh + 1 - fpadelta) / dspeed - 0.00005;
                        var prevoh = data.fpa / (framesoh + 1 - fpadelta) / dspeed - 0.00005;
                        var prev = Math.max(prevmh / stats.info.mainhand.speed, prevoh / stats.info.offhand.speed);
                        prevmh = prev * stats.info.mainhand.speed;
                        prevoh = prev * stats.info.offhand.speed;
                        bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Previous breakpoint: <span class=\"d3-color-white\">" +
                          DiabloCalc.formatNumber(prevmh, 4, 10000) + "</span>/<span class=\"d3-color-white\">" + DiabloCalc.formatNumber(prevoh, 4, 10000) + "</span> APS";
                        bpTip += fpaDelta(prevmh, prevoh);
                      } else {
                        if (frames > 1) {
                          var next = data.fpa / (frames - fpadelta) / dspeed + 0.00005;
                          bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Next breakpoint: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(next, 4, 10000) + "</span> APS";
                          bpTip += fpaDelta(next);
                          if (data.speed) {
                            var basemh = basespeed / (1 + 0.01 * (stats.ias || 0));
                            var iasneed = Math.ceil(10 * (100 * next / basemh - 100 - (stats.ias || 0))) / 10;
                            bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>IAS to next breakpoint: <span class=\"d3-color-white\">" + iasneed + "%</span>";
                          }
                        }
                        var prev = data.fpa / (frames + 1 - fpadelta) / dspeed - 0.00005;
                        bpTip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Previous breakpoint: <span class=\"d3-color-white\">" + DiabloCalc.formatNumber(prev, 4, 10000) + "</span> APS";
                        bpTip += fpaDelta(prev);
                      }
                      if (!sequence) {
                        bpTip += "</p><table class=\"col2\"><tr><th>FPA</th><th>APS</th><th></th><th>FPA</th><th>APS</th><th></th><th>FPA</th><th>APS</th></tr>";
                        var fpa0 = frames, fpa1 = frames;
                        if (framesmh && framesoh) {
                          fpa0 = framesmh;
                          fpa1 = framesoh;
                        }
                        var list = [];
                        var maxaps = Math.max(3, stats.info.mainhand.speed);
                        if (framesoh) {
                          maxaps = Math.max(stats.info.offhand.speed);
                        }
                        maxaps = Math.max(maxaps * 1.2, maxaps + 0.5);
                        for (var curfpa = Math.floor(data.fpa) + fpadelta; curfpa >= 1; curfpa -= 1) {
                          var curaps = Math.max(1, data.fpa / (curfpa + 1 - fpadelta) / dspeed + 0.00005);
                          if (curaps > maxaps && list.length % 3 == 0) break;
                          /*if (fpa != Math.floor(data.fpa) + fpadelta && fpa != 1 && fpa != fpa0 && fpa != fpa1 &&
                              fpa % 5 != 0 && Math.abs(fpa - fpa0) > 2 && Math.abs(fpa - fpa1) > 2) {
                            continue;
                          }*/
                          list.push([curfpa, curaps.toFixed(4)]);
                        }
                        var fcol = Math.ceil(list.length / 3);
                        for (var row = 0; row < fcol; ++row) {
                          bpTip += "<tr>";
                          var cf = (list[row][0] === fpa0 || list[row][0] === fpa1 ? " class=\"current\"" : "");
                          bpTip += "<td" + cf + ">" + list[row][0] + "</td><td" + cf + ">" + list[row][1] + "</td>";
                          if (row + fcol < list.length) {
                            cf = (list[row + fcol][0] === fpa0 || list[row + fcol][0] === fpa1 ? " class=\"current\"" : "");
                            bpTip += "<td></td><td" + cf + ">" + list[row + fcol][0] + "</td><td" + cf + ">" + list[row + fcol][1] + "</td>";
                          }
                          if (row + fcol + fcol < list.length) {
                            cf = (list[row + fcol + fcol][0] === fpa0 || list[row + fcol + fcol][0] === fpa1 ? " class=\"current\"" : "");
                            bpTip += "<td></td><td" + cf + ">" + list[row + fcol + fcol][0] + "</td><td" + cf + ">" + list[row + fcol + fcol][1] + "</td>";
                          }
                          bpTip += "</tr>";
                        }
  /*                        bpTip += "<tr" + (fpa == fpa0 || fpa == fpa1 ? " class=\"current\"" : "") + "><td>" + fpa + "</td>";
                          bpTip += "<td>" + aps.toFixed(4) + "</td>";
                          var delta = 100 * (frames / fpa - 1);
                          bpTip += "<td class=\"" + (delta < 0 ? "d3-color-red" : (delta > 0 ? "d3-color-green" : "d3-color-gray")) + "\">";
                          bpTip += (delta < 0 ? delta.toFixed(1) : "+" + delta.toFixed(1)) + "%</td></tr>";
                        }*/
                        bpTip += "</table><p>";
                      }
                    }
                    if (data.total) {
                      var ticks;
                      if (framesmh && framesoh) {
                        var whole = Math.floor(data.total / (framesmh + framesoh));
                        var remain = data.total - whole * (framesmh + framesoh);
                        ticks = whole * 2;
                        if (remain) {
                          ticks += (remain > framesmh ? 1 : 0.5) + (remain > framesoh ? 1 : 0.5);
                        }
                      } else {
                        ticks = Math.ceil(data.total / frames);
                      }
                      tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Total ticks: " + fmtValue(ticks, 1, "white");
                      tip += " (<span class=\"d3-color-green\">" + DiabloCalc.formatNumber((data.value || result[key].value) * mul * ticks, 0, 10000) + "</span> damage)";
                    }
                  }
                }
                if (sequence) {
                  totalTime += 1 / aps;
                } else {
                  mul *= aps;
                }
              } else if (data.refspeed) {
                if (speedCache[data.refspeed] === undefined) {
                  okay = false;
                } else {
                  mul /= speedCache[data.refspeed];
                  tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Speed: " + fmtValue(1 / speedCache[data.refspeed], 2, "white");
                }
              }
              if (data.cd) {
                data.cd = execString(data.cd);
                if (data.cdr !== false) {
                  //data.cd -= (stats.leg_ingeom || 0);
                  data.cd *= (1 - 0.01 * (stats.cdr || 0));
                }
                if (data.cd < 0.01) {
                  okay = false;
                } else {
                  tip += "<br/><span class=\"tooltip-icon-nobullet\"></span>Cooldown: " + fmtValue(data.cd, 2, "white") + " seconds";
                  mul /= data.cd;
                }
              }
              sum += (data.value || result[key].value) * mul;
            }
          }
        });
        if (sequence && okay) {
          if (totalTime > 0.1) {
            sum /= totalTime;
            speedCache[stat] = totalTime;
            tip = "<br/><span class=\"tooltip-icon-bullet\"></span>Sequence length: " + fmtValue(totalTime, 2, "white") + " seconds" + tip;
          } else {
            okay = false;
          }
        }
        if (okay) {
          result[stat].value = sum;
          result[stat].text = DiabloCalc.formatNumber(sum, 0, 10000);
          result[stat].tip = tipHeader(stat.replace("DPS", "Damage Per Second"), result[stat].text);
          result[stat].tip += fmtTip(lines[stat].tip);
          result[stat].tip += tip + "</p></div>";
          if (!lines[stat].nobp) {
            breakpointTip += bpTip;
            breakpointValues = breakpointValues.concat(bpValues);
          }
        } else {
          next.push(stat);
        }
      }
      if (next.length >= sumlines.length) {
        break;
      }
      sumlines = next;
    }
    for (var index = 0; index < sumlines.length; ++index) {
      delete result[sumlines[index]];
    }
    if (breakpointValues.length) {
      var text = [];
      for (var i = 0; i < breakpointValues.length; ++i) {
        text.push(breakpointValues[i] + " frames");
      }
      var title = "Breakpoint" + (text.length > 1 ? "s" : "");
      var text = text.join(" / ");
      result[title] = {
        value: breakpointValues,
        text: text,
        tip: tipHeader(title, text) + breakpointTip + "</p></div>",
      };
    }

    return result;
  }

  DiabloCalc.skill_formatObject = formatObject;
  DiabloCalc.skill_processInfo = processInfo;

  DiabloCalc.SkillBox = function(type, options) {
    var self = this;

    this.getInfo = function() {
      if (this.buff) return this.buff;
      if (!this[this.type]) {
        if (this.type === "skill" && this.index !== undefined && this.index <= 1) {
          var mh = DiabloCalc.itemSlots.mainhand.item;
          mh = (mh && DiabloCalc.itemById[mh.id] && DiabloCalc.itemById[mh.id].type);
          mh = (mh && DiabloCalc.itemTypes[mh].attack || "hand");
          return DiabloCalc.skills.attack[mh];
        }
        return;
      }
      switch (this.type) {
      case "skill": return DiabloCalc.skills[DiabloCalc.charClass][this.skill[0]];
      case "passive": return DiabloCalc.passives[DiabloCalc.charClass][this.passive];
      case "gem": return DiabloCalc.legendaryGems[this.gem];
      case "affix": return DiabloCalc.itemaffixes[this.affix];
      }
    };

    this._set = function(data) {
      if (this.type === "skill") this.setSkill(data);
      if (this.type === "passive") this.setPassive(data);
    };
    this.setSkill = function(skill) {
      this.skill = skill;
      this.desc.empty();
      var info = this.getInfo();
      if (this.info) {
        this.line.append(this.info);
      }
      if (info) {
        this.icon.removeClass("empty");
        if (info.row !== undefined) {
          this.icon.removeClass("skill-icon-attack");
          this.icon.css("background-position", (-info.col * 42) + "px " + (-info.row * 84) + "px");
        } else {
          this.icon.addClass("skill-icon-attack").addClass(info.id);
          this.icon.css("background-position", "");
        }
        this.desc.append("<span class=\"skill-name\">" + info.name + "</span>");
        this.desc.append("<span class=\"skill-separator\"></span>");
        if (skill) {
          this.desc.append("<span class=\"skill-rune\"><span class=\"skill-rune-" + skill[1] + "\"></span> " + (skill[1] === "x" ? "No Rune" : info.runes[skill[1]]) + "</span>");
        } else {
          this.desc.append(this.info);
        }
      } else {
        this.icon.addClass("empty");
        this.icon.removeClass("skill-icon-attack");
        this.desc.append("<span class=\"skill-none\">Choose Skill</span>");
        this.desc.append("<span class=\"skill-separator\"></span>");
      }
      this.updateParams();
    };
    this.setPassive = function(passive) {
      this.passive = passive;
      var info = (passive && DiabloCalc.passives[DiabloCalc.charClass][passive]);
      if (info) {
        this.applybox.prop("checked", info.active !== false);
        this.icon.removeClass("empty");
        this.icon.css("background-position", (-info.index * 42) + "px 0");
        this.name.removeClass().addClass("skill-name").text(info.name);
      } else {
        this.icon.addClass("empty");
        this.name.removeClass().addClass("skill-none").text("Choose Skill");
      }
      this.updateParams();
    };

    this.paramList = [];
    this.updateParams = function() {
      this.params.empty();
      this.paramList = [];
      var info = this.getInfo();
      if (!info || !info.params) return
      $.each(info.params, function(i, param) {
        var param = info.params[i];
        if (self.type === "skill" && param.rune && param.rune.indexOf(self.skill[1]) < 0) return;
        var value = $("<span class=\"param-value\"></span>").text(param.val + (param.percent ? "%" : ""));
        var slider = $("<div></div>").slider({
          value: param.val,
          min: param.min,
          max: param.max,
          step: param.step || 1,
          slide: function(event, ui) {
            param.val = ui.value;
            value.text(ui.value + (param.percent ? "%" : ""));
            DiabloCalc.trigger("updateSkills");
            if (self.buff && self.buff.type === "affix" && DiabloCalc.tooltip.getNode() === self.header[0]) {
              DiabloCalc.tooltip.showItem(self.header[0], self.buff.item, [ui.value]);
            }
          },
        }).click(function(evt) {
          evt.stopPropagation(true);
        });
        var len = (param.max - param.min) / (param.step || 1);
        if (len <= 5) {
          slider.css("width", len * 40);
        } else {
          slider.css("width", "");
        }
        var line = $("<li></li>");
        line.append("<span class=\"param-name\"><b>" + param.name + ":</b></span>", value, $("<div class=\"param-slider\"></div>").append(slider));
        self.paramList.push({
          param: param,
          value: value,
          slider: slider,
          line: line,
        });
        self.params.append(line);
      });
    };

    this.update = function() {
      var info = this.getInfo();
      if (!info) {
        this.apply.hide();
        if (this.info) {
          this.info.remove();
          this.info = undefined;
        }
        return;
      }

      var stats = DiabloCalc.getStats();
      var noBuffs = false;

      if (this.type === "skill") {
        var bonus = getSkillBonus(this.skill, stats);
        this.applybox.prop("checked", info.active !== false);
        this.apply.toggle(!!bonus);
      } else if (this.type === "passive") {
        var bonus = getPassiveBonus(this.passive, stats);
        this.apply.toggleClass("always", info.active === undefined);
        this.applybox.prop("disabled", info.active === undefined);
        this.applybox.prop("checked", info.active !== false);
        this.apply.toggle(!!bonus);
      } else if (this.type === "gem") {
        if (info.check && typeof info.buffs === "function") {
          var result = info.buffs(stats.gems[this.gem] || 0, stats);
          this.apply.toggle(!!result);
          if (!result) noBuffs = true;
        } else {
          var effect = !!info.effects[0].stat;
          if (stats.gems[this.gem] && stats.gems[this.gem] >= 25) {
            effect = (effect || !!info.effects[1].stat);
          }
          this.apply.toggle(effect);
        }
        this.applybox.prop("checked", !!(info.always || info.active));
        this.name.html(info.name + (stats.gems[this.gem] ? " <span class=\"gem-rank\">&#x2013; Rank " + stats.gems[this.gem] + "</span>" : ""));
      } else if (this.type === "affix") {
        this.applybox.prop("checked", info.active === true);

        var itemid = DiabloCalc.getSlotId(stats.affixes[this.affix].slot);
        var item = DiabloCalc.itemById[itemid];
        if (item) this.icon.css("background-image", "url(" + DiabloCalc.getItemIcon(item.id) + ")");
        if (stats.affixes[this.affix].set) {
          var title = DiabloCalc.itemSets[stats.affixes[this.affix].set].name;
          if (stats.affixes[this.affix].pieces) {
            title += " <span class=\"gem-rank\">&#x2013; " + stats.affixes[this.affix].pieces + " pieces</span>";
          }
          this.name.html(title);
        } else if (item) {
          this.name.text(item.name);
        }
      }

      var anyLines = false;
      $.each(this.paramList, function(i, data) {
        var values = {min: data.param.min, max: data.param.max, val: data.param.val};
        data.value.text(values.val + (data.param.percent ? "%" : ""));
        data.slider.slider({
          value: values.val,
          min: values.min,
          max: values.max,
        });
        var len = (values.max - values.min) / (data.param.step || 1);
        if (len <= 5) {
          data.slider.css("width", len * 40);
        } else {
          data.slider.css("width", "");
        }
        var shown = values.min !== values.max && (info.active !== false || data.param.buffs === false) && !noBuffs;
        anyLines = anyLines || shown;
        if (shown && data.param.show) {
          if (self.type === "skill") {
            shown = data.param.show(self.skill[1], stats);
          } else {
            shown = data.param.show(stats);
          }
        }
        data.line.toggle(!!shown);
      });
      this.params.toggle(anyLines);

      var effects, curInfo;

      var elites = (DiabloCalc.options.showElites ? 1 + 0.01 * (stats.edmg || 0) : 1);

      if (typeof info.info === "function") {
        switch (this.type) {
        case "skill": curInfo = info.info(this.skill[1], stats); break;
        case "passive": curInfo = info.info(stats); break;
        case "gem": curInfo = info.info(stats.gems[this.gem], stats); break;
        case "affix": curInfo = info.info(stats.affixes[this.affix].value, stats); break;
        }
        if (curInfo) {
          curInfo = $.extend({}, curInfo);
          for (var stat in curInfo) {
            if (typeof curInfo[stat] === "number") {
              curInfo[stat] = DiabloCalc.formatNumber(curInfo[stat] * elites, 0, 10000);
            }
          }
        }
      } else if (info.info) {
        if (this.type === "skill" && this.skill) {
          curInfo = info.info[this.skill[1]];
          if (info.info["*"]) {
            curInfo = $.extend({}, info.info["*"], curInfo);
          }
        } else {
          curInfo = info.info;
        }
        if (curInfo) {
          curInfo = $.extend({}, curInfo);
          for (var stat in curInfo) {
            if (typeof curInfo[stat] !== "string") continue;
            var expr = curInfo[stat];
            var unmod = undefined;
            if (expr[0] == '@' || expr[0] == '%') {
              unmod = expr[0];
              expr = expr.substring(1);
            }
            expr = execString(expr, stats, this.affix, info.params);
            if (typeof expr === "number") {
              if (!unmod) expr *= elites;
              if (unmod == "%") {
                curInfo[stat] = Math.floor(expr) + "%";
              } else {
                curInfo[stat] = DiabloCalc.formatNumber(expr, 0, 10000);
              }
            } else {
              curInfo[stat] = expr;
            }
          }
        }
      }

      if (curInfo) {
        var results = processInfo(curInfo, {affix: this.affix, params: info.params, skill: this.skill});
        if (!this.info) {
          this.info = $("<ul></ul>").addClass("skill-info");
          if (this.type !== "skill" || !this.skill) {
            this.desc.append(this.info);
          } else {
            this.line.append(this.info);
          }
          this.info.click(function() {
            return false;
          });
        }
        this.info.empty();
        $.each(results, function(stat, value) {
          var out = $("<span><b>" + stat + ":</b> " + value.text + "</span>");
          if (value.tip) {
            out.mouseover(function() {
              DiabloCalc.tooltip.showHtml(this, value.tip);
              return false;
            }).mouseleave(function() {
              DiabloCalc.tooltip.hide();
            });
          }
          self.info.append($("<li></li>").append(out));
        });
      } else if (this.info) {
        this.info.remove();
        delete this.info;
      }
    };

    options = options || {};

    this.type = type;
    this.index = options.index;
    this.buff = options.buff;
    this.line = $("<div class=\"skill-line\"></div>");
    if (options.parent) {
      options.parent.append(this.line);
    }
    if (type === "skill" || (this.buff && (this.buff.type === "skill" || this.buff.type === "custom"))) {
      if (this.index !== undefined) this.line.append("<span class=\"skill-key skill-key-" + this.index + "\"></span>");
      this.header = $("<span class=\"skill-header\"></span>");
      this.icon = $("<span class=\"skill-icon\"></span>");
      this.icon.append("<span class=\"skill-frame\"></span>");
    } else if (type === "passive" || (this.buff && this.buff.type === "passive")) {
      this.header = $("<span class=\"passive-header\"></span>");
      this.icon = $("<span class=\"passive-icon\"></span>");
      this.icon.append("<span class=\"passive-frame\"></span>");
    } else {
      this.header = $("<span class=\"passive-header readonly\"></span>");
      this.icon = $("<span class=\"item-icon\"></span>");
    }
    if (options.readonly || this.buff) {
      this.header.addClass("readonly");
    }
    if (options.level) {
      this.icon.append("<span class=\"skill-text\">" + options.level + "</span>");
    }
    this.desc = $("<span class=\"skill-description\"></span>");

    this.line.append(this.header.append(this.icon, this.desc));

    this.applybox = $("<input type=\"checkbox\"></input>");
    this.params = $("<ul class=\"skill-info\"></ul>").hide();
    if (type === "skill" || (this.buff && this.buff.type === "skill")) {
      this.apply = $("<label class=\"skill-bonus\">Include in stats</label>");
      this.header.after(this.apply);
      this.line.append(this.params);
    } else {
      this.name = $("<span class=\"skill-name\"></span>");
      this.desc.append(this.name, "<span class=\"skill-separator\"></span>");
      this.apply = $("<label class=\"passive-apply\">Include in stats</label>");
      this.desc.append(this.apply);
      this.desc.append(this.params);
    }
    this.apply.prepend(this.applybox);

    if (type === "gem") {
      this.gem = options.gem;
      var info = DiabloCalc.legendaryGems[this.gem];
      this.applybox.prop("disabled", !!info.always);
      this.apply.toggleClass("always", !!info.always);
      this.apply.toggle(info.always || info.active !== undefined);
      this.icon.css("background-image", "url(" + DiabloCalc.getItemIcon(this.gem) + ")");
    } else if (type === "affix") {
      this.affix = options.affix;
      var info = DiabloCalc.itemaffixes[this.affix];
      this.apply.toggle(info.active !== undefined);
    }

    if (type === "skill") {
      this.setSkill();
      this.header.mouseover(function() {
        if (self.skill && DiabloCalc.skills[DiabloCalc.charClass][self.skill[0]]) {
          DiabloCalc.tooltip.showSkill(this, DiabloCalc.charClass, self.skill[0], self.skill[1]);
        } else {
          var info = self.getInfo();
          if (info) {
            DiabloCalc.tooltip.showAttack(this, info);
          }
        }
      });
      this.applybox.change(function() {
        var info = (self.skill && DiabloCalc.skills[DiabloCalc.charClass][self.skill[0]]);
        if (info) {
          info.active = this.checked;
          DiabloCalc.trigger("updateSkills");
        }
      });
    } else if (type === "passive") {
      this.setPassive();
      this.header.mouseover(function() {
        if (self.passive && DiabloCalc.passives[DiabloCalc.charClass][self.passive]) {
          DiabloCalc.tooltip.showSkill(this, DiabloCalc.charClass, self.passive);
        }
      });
      this.applybox.click(function(evt) {
        var info = (self.passive && DiabloCalc.passives[DiabloCalc.charClass][self.passive]);
        if (info) {
          info.active = this.checked;
          DiabloCalc.trigger("updateSkills");
        }
        evt.stopPropagation();
      });
    } else if (type === "gem") {
      this.header.mouseover(function() {
        if (self.gem) {
          DiabloCalc.tooltip.showGem(this, self.gem, DiabloCalc.getStats().gems[self.gem]);
        }
      });
      this.applybox.click(function(evt) {
        var info = (self.gem && DiabloCalc.legendaryGems[self.gem]);
        if (info) {
          info.active = this.checked;
          DiabloCalc.trigger("updateSkills");
        }
        evt.stopPropagation();
      });
    } else if (type === "affix") {
      this.header.mouseover(function() {
        var stats = DiabloCalc.getStats();
        if (stats.affixes[self.affix]) {
          DiabloCalc.tooltip.showItem(this, stats.affixes[self.affix].slot);
        }
      });
      this.applybox.click(function(evt) {
        var info = (self.affix && DiabloCalc.itemaffixes[self.affix]);
        if (info) {
          info.active = this.checked;
          DiabloCalc.trigger("updateSkills");
        }
        evt.stopPropagation();
      });
    } else if (this.buff) {
      var onInner = false;
      if (this.buff.type === "skill") {
        var skill = DiabloCalc.skills[this.buff.charClass][this.buff.id];
        this.icon.removeClass("empty");
        this.icon.css("background-position", (-skill.col * 42) + "px " + (-skill.row * 84) + "px");
        this.desc.append("<span class=\"skill-name\">" + skill.name + "</span>");
        this.desc.append("<span class=\"skill-separator\"></span>");
        if (this.buff.multiple) {
          this.header.removeClass("skill-header").addClass("passive-header");
          this.runebox = {};
          for (var rune in this.buff.runes) {
            this.runebox[rune] = $("<input type=\"checkbox\"></input>").click((function(rune) {return function() {
              self.buff.runevals[rune] = $(this).prop("checked");
              DiabloCalc.trigger("updateSkills");
            };})(rune));
            this.desc.append($("<label class=\"rune-box\"></label>").append(this.runebox[rune],
                "<span class=\"skill-rune\"><span class=\"skill-rune-" + this.buff.runelist + "\"></span> " + this.buff.runes[rune] + "</span>")
              .mouseover((function(rune) {return function() {
                DiabloCalc.tooltip.showSkill(this, self.buff.charClass, self.buff.id, rune, true);
                return false;
              };})(rune)).mouseleave(function() {
                DiabloCalc.tooltip.hide();
              })
            );
          }
          this.apply.hide();
        } else if (this.buff.runelist.length > 1 || this.buff.runelist === "*") {
          this.runebox = $("<select class=\"skill-runelist\"></select>");
          for (var rune in this.buff.runes) {
            this.runebox.append("<option class=\"skill-rune-option rune-" + rune + "\" value=\"" + rune + "\">" + this.buff.runes[rune] + "</option>");
          }
          this.desc.addClass("chosen-noframe");
          this.desc.append(this.runebox);
          var prevRune = undefined;
          this.runebox.chosen({
            disable_search: true,
            inherit_select_classes: true,
          }).change(function() {
            var span = $(this).next().find("span").first();
            if (prevRune) span.removeClass(prevRune);
            prevRune = "rune-" + $(this).val();
            span.addClass("skill-rune-option " + prevRune);
          }).change().change(function() {
            self.buff.runevals = $(this).val();
            DiabloCalc.trigger("updateSkills");
          });
          DiabloCalc.chosenTips(this.runebox, function(rune) {
            if (rune != "*") {
              onInner = true;
              DiabloCalc.tooltip.showSkill(this, self.buff.charClass, self.buff.id, rune, true);
            }
          });
        } else if (this.buff.runelist !== "x") {
          this.desc.append("<span class=\"skill-rune\"><span class=\"skill-rune-" + this.buff.runelist + "\"></span> " + this.buff.runes[this.buff.runelist] + "</span>");
        }
        this.header.mouseover(function() {
          if (!self.buff.multiple) {
            if (onInner) {
              onInner = false;
              return true;
            }
            DiabloCalc.tooltip.showSkill(this, self.buff.charClass, self.buff.id, self.runebox ? self.runebox.val() : self.buff.runelist);
          } else {
            DiabloCalc.tooltip.showSkill(this, self.buff.charClass, self.buff.id);
          }
        });
      } else if (this.buff.type === "passive") {
        var skill = DiabloCalc.passives[this.buff.charClass][this.buff.id];
        this.icon.removeClass("empty");
        this.icon.css("background-position", (-skill.index * 42) + "px 0");
        this.name.removeClass().addClass("skill-name").text(skill.name);
        this.header.mouseover(function() {
          DiabloCalc.tooltip.showSkill(this, self.buff.charClass, self.buff.id);
        });
      } else if (this.buff.type === "affix") {
        var item = DiabloCalc.itemById[this.buff.item];
        if (item) {
          this.icon.css("background-image", "url(" + DiabloCalc.getItemIcon(item.id) + ")");
          this.name.text(item.name);
          this.header.mouseover(function() {
            var custom = undefined;
            if (self.buff.params) {
              custom = [self.buff.params[0].val];
            }
            DiabloCalc.tooltip.showItem(this, item.id, custom);
          });
        }
      } else if (this.buff.type === "gem") {
        this.icon.css("background-image", "url(" + DiabloCalc.getItemIcon(this.buff.id) + ")");
        this.name.text(DiabloCalc.legendaryGems[this.buff.id].name);
        this.header.mouseover(function() {
          DiabloCalc.tooltip.showGem(this, self.buff.id, 25);
        });
      } else if (this.buff.type === "custom") {
        this.icon.removeClass("empty");
        this.icon.css("background-position", (-this.buff.icon * 42) + "px 0");
        this.name.removeClass().addClass("skill-name").text(this.buff.name);
        this.header.mouseover(function() {
          DiabloCalc.tooltip.showCustomSkill(this, self.buff);
        });
      }
      this.applybox.prop("checked", this.buff.active);
      this.applybox.change(function() {
        self.buff.active = this.checked;
        if (self.boxlabels) {
          for (var i = 0; i < self.boxlabels.length; ++i) {
            self.boxlabels[i].toggle(this.checked);
          }
        }
        if (self.buff.params) {
          self.params.toggle(this.checked);
        }
        DiabloCalc.trigger("updateSkills");
      });
      if (this.buff.boxnames) {
        this.boxes = [];
        this.boxlabels = [];
        for (var i = 0; i < this.buff.boxnames.length; ++i) {
          var box = $("<input type=\"checkbox\"></input>");
          var boxlabel = $("<label class=\"" + (this.buff.type === "skill" ? "skill-bonus" : "passive-apply") + "\">" + this.buff.boxnames[i] + "</label>").prepend(box);
          this.boxes.push(box);
          this.boxlabels.push(boxlabel);
          this.params.before(boxlabel);
          boxlabel.toggle(this.buff.active !== false);
          box.click((function(i) {return function() {
            self.buff.boxvals[i] = $(this).prop("checked");
            DiabloCalc.trigger("updateSkills");
          };})(i));
        }
      }
      this.updateParams();
      if (this.buff.params) {
        this.params.toggle(this.buff.active);
      }
    }
    this.updateBoxes = function() {
      if (this.buff) {
        this.apply.toggle(!this.buff.multiple && this.buff.active !== undefined);
        if (!this.buff.multiple) {
          this.applybox.prop("checked", this.buff.active);
          if (this.runebox) {
            this.runebox.val(this.buff.runevals).trigger("chosen:updated");
          }
        } else {
          for (var id in this.runebox) {
            this.runebox[id].prop("checked", !!this.buff.runevals[id]);
          }
        }
        if (this.boxlabels) {
          for (var i = 0; i < this.boxlabels.length; ++i) {
            this.boxlabels[i].toggle(this.buff.active !== false);
          }
        }
        if (this.boxes) {
          for (var i = 0; i < this.boxes.length; ++i) {
            this.boxes[i].prop("checked", !!(this.buff.boxvals && this.buff.boxvals[i]));
          }
        }
        if (this.buff.params) {
          this.params.toggle(this.buff.active !== false);
        }
      }
      this.updateParams();
    };
    this.header.mouseleave(function() {
      DiabloCalc.tooltip.hide();
    });
    //this.info.hide();
    this.apply.click(function(evt) {
      evt.stopPropagation();
    });
    this.updateParams();

    if ((this.type === "skill" || this.type === "passive") && !options.readonly) {
      this.accept = function(skill) {
        if (!skill) return true;
        if (this.type === "skill" && this.index === 0) {
          var info = DiabloCalc.skills[DiabloCalc.charClass][skill[0]];
          if (!info || info.nolmb) return false;
        }
        return true;
      };
      function makeDraggable(elem1, elem2, helper, hide, tol) {
        elem1.data("box", self);
        var reverting = false;
        elem1.draggable({
          zIndex: 100,
          cursor: "-webkit-grabbing",
          appendTo: "body",
          tolerance: tol || "intersect",
          distance: 4,
          helper: helper,
          start: function(event, ui) {
            if (!self[self.type]) {
              setTimeout(function() {
                $("body").css("cursor", "");
              });
              return false;
            }
            hide(true);
            if (DiabloCalc.tooltip) DiabloCalc.tooltip.disable();
          },
          revert: function(valid) {
            if (DiabloCalc.tooltip) DiabloCalc.tooltip.enable();
            return !valid;
            if (!valid) {
              if (!window.event) return true;
              reverting = true;
              DiabloCalc.popupMenu(window.event, {
                "Delete": function() {
                  var obj = elem1.draggable("instance");
                  reverting = false;
                  if (obj && obj._trigger("stop", event) !== false) {
                    obj._clear();
                  }
                  self._set();
                  DiabloCalc.trigger("updateSkills", true);
                },
              }, function() {
                var obj = elem1.draggable("instance");
                reverting = false;
                if (!obj) return;
                $(obj.helper).animate(obj.originalPosition, parseInt(obj.options.revertDuration, 10), function() {
                  if (obj._trigger("stop", event) !== false) {
                    obj._clear();
                  }
                });
              });
            }
            return false;
          },
          stop: function() {
            if (reverting) return false;
            setTimeout(function() {
              hide(false);
            }, 0);
          },
        });
        elem2.droppable({
          hoverClass: "selected",
          accept: function(other) {
            var box = other.data("box");
            if (!box || box.type !== self.type || !box[box.type] || box === self) return false;
            return self.accept(box[box.type]) && box.accept(self[self.type]);
          },
          drop: function(event, ui) {
            var box = ui.draggable.data("box");
            if (!box || box.type !== self.type || box === self) return false;
            var data = box[box.type];
            if (!data || !self.accept(data) || !box.accept(self[self.type])) return;
            box._set(self[self.type]);
            self._set(data);
            DiabloCalc.trigger("updateSkills", true);
          },
        });
      }
      makeDraggable(this.header, this.line, function() {
        return self.header.clone().addClass("class-" + DiabloCalc.charClass);
      }, function(flag) {
        self.header.css("visibility", flag ? "hidden" : "");
      });
      var doll = (this.type === "skill" ? DiabloCalc.getDollSkill : DiabloCalc.getDollPassive);
      if (doll) doll = doll(this.index);
      if (doll) {
        makeDraggable(doll, doll, function() {
          var outer = $("<div class=\"class-" + DiabloCalc.charClass + "\" style=\"width: 42px; height: 42px; position: absolute\"></div>");
          return outer.append(doll.clone().css("left", 0));
        }, function(flag) {
          doll.toggleClass("empty", flag || !self[self.type]);
        }, "pointer");
      }
    }

    DiabloCalc.enableTouch(this.header);
  };

})();