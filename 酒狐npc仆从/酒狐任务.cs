using System.Collections.Generic;
using Terraria;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>酒狐任务类型。</summary>
public enum 任务类型
{
    钓鱼,
    采种,
    搭平台,
    主动防御,
    造房纸,
    清理门户,
    恋还是练
}

/// <summary>
/// 一条酒狐任务记录。除类型外，还承载状态机运行数据（当前状态/屏蔽/重试计时/累计等待）。
/// 状态流：酒狐确认需求中 → 酒狐缺少xxx → (重试，每几秒) → 执行中；一分钟后仍不满足 → 屏蔽。
/// </summary>
public sealed class 任务记录
{
    public 任务类型 类型;

    /// <summary>状态文本：酒狐确认需求中 / 酒狐缺少xxx / 执行中 / 已屏蔽。</summary>
    public string 状态 = "酒狐确认需求中";

    /// <summary>是否被屏蔽（一分钟后仍无法执行）。屏蔽后在界面用 X 标记，需玩家重设/重排才能再执行。</summary>
    public bool 屏蔽;

    /// <summary>重试倒计时：到达0时再检测一次需求。</summary>
    public int 重试计时;

    /// <summary>处于“缺少xx”状态的总等待 tick（用于一分钟后屏蔽）。</summary>
    public int 累计等待;

    /// <summary>是否正在执行（喝到需求后）。只能同时有一个在执行。</summary>
    public bool 执行中;

    /// <summary>建造类任务（造房纸/搭平台）是否已获玩家确认。</summary>
    public bool 已确认;

    /// <summary>执行过程里的动作计时（用于钓鱼/种植/搭平台等节拍）。</summary>
    public int 动作计时;

    //===== 执行过程的临时目标/进度（供具体任务使用）=====
    public int 目标X;
    public int 目标Y;
    public int 层数;        //搭平台：当前已铺层数 / 造房纸：当前阶段
    public int 方向;        //搭平台：当前铺向（-1左 1右）
    public bool 行动;       //造房纸：当前阶段动作是否已推进

    public 任务记录(任务类型 type)
    {
        类型 = type;
    }
}

/// <summary>任务定义：每种任务的中文名 + 需求描述（用于“任务单”界面展示）。</summary>
public static class 任务定义
{
    public static readonly 任务类型[] 全部类型 =
    {
        任务类型.钓鱼, 任务类型.采种, 任务类型.搭平台, 任务类型.主动防御,
        任务类型.造房纸, 任务类型.清理门户, 任务类型.恋还是练
    };

    public static string 名称(任务类型 type) => type switch
    {
        任务类型.钓鱼 => "钓鱼",
        任务类型.采种 => "采种",
        任务类型.搭平台 => "搭平台",
        任务类型.主动防御 => "主动防御",
        任务类型.造房纸 => "造房纸！",
        任务类型.清理门户 => "清理门户",
        任务类型.恋还是练 => "恋还是练？",
        _ => type.ToString()
    };

    public static string 需求(任务类型 type) => type switch
    {
        任务类型.钓鱼 => "钓鱼竿，鱼饵，水域",
        任务类型.采种 => "种子",
        任务类型.搭平台 => "平台，起始点，配置",
        任务类型.主动防御 => "",
        任务类型.造房纸 => "木头",
        任务类型.清理门户 => "",
        任务类型.恋还是练 => "",
        _ => ""
    };
}

/// <summary>
/// 酒狐任务系统：持有每玩家的任务列表，并驱动任务状态机（需求检测/重试/屏蔽/执行，同一时间只执行一个）。
/// </summary>
public sealed class 酒狐任务系统 : ModSystem
{
    private static readonly Dictionary<int, List<任务记录>> lists = new();
    //每玩家当前正在执行的记录引用（保证“同时只执行一个”）
    private static readonly Dictionary<int, 任务记录> executing = new();

    public static List<任务记录> 获取列表(Player player)
    {
        int who = player.whoAmI;
        if (!lists.TryGetValue(who, out List<任务记录> list))
        {
            list = new List<任务记录>();
            lists[who] = list;
        }
        return list;
    }

    public static List<任务记录> 主玩家列表() => 获取列表(Main.LocalPlayer);

    public static 任务记录 当前执行(Player player)
    {
        return executing.TryGetValue(player.whoAmI, out 任务记录 r) ? r : null;
    }

    /// <summary>把任务加入列表（去重：同类型只保留一条）。返回是否成功。</summary>
    public static bool 添加任务(Player player, 任务类型 type)
    {
        List<任务记录> list = 获取列表(player);
        foreach (任务记录 r in list)
            if (r.类型 == type) return false;   //已存在
        list.Add(new 任务记录(type));
        return true;
    }

    /// <summary>移除任务。若该任务正在执行，则清空执行状态并执行清理（恢复被其改变的世界态）。</summary>
    public static void 移除任务(Player player, 任务记录 record)
    {
        try
        {
            酒狐任务执行.停止任务(player, record);
            if (executing.TryGetValue(player.whoAmI, out 任务记录 cur) && cur == record)
                executing.Remove(player.whoAmI);
        }
        catch { }
        try
        {
            获取列表(player).Remove(record);
        }
        catch { }
    }

    internal static void 设置执行(Player player, 任务记录 record) => executing[player.whoAmI] = record;
    internal static void 清除执行(Player player, 任务记录 record)
    {
        if (executing.TryGetValue(player.whoAmI, out 任务记录 cur) && cur == record)
            executing.Remove(player.whoAmI);
    }
}
