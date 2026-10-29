using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐头顶台词系统：
///  · 排队说话（闲聊/讨食等“聊天类”台词）：每句之间至少间隔 30s，多句排队依次执行；
///  · 直接说话（战斗/好痛/夸奖/寻宝/复活/喂食回应等“非聊天类”）：不排队、立即显示；
///  · 任何“非聊天类”台词出现时，会把聊天类台词的冷却再往后推 5s（避免两种台词挤在一起）；
///  · 计时门：战斗中所有台词计时器暂停（只有“好痛台词”例外，它照常倒数），
///    脱战后还要再等 5s（脱战等待）才恢复倒计时。
/// </summary>
public static class 酒狐头顶文本
{
    private sealed class 台词
    {
        public string 文本 = "";
        public int 总时长;
        public int 剩余;
        public int 序号;      //用于叠放高度（越大越高）
    }

    private static readonly Dictionary<int, List<台词>> 活动 = new();
    private static readonly Dictionary<int, Queue<string>> 队列 = new();
    private static readonly Dictionary<int, int> 下次可排队 = new();   //下一次允许“聊天类台词”开始的tick
    private static readonly Dictionary<int, int> 脱战保持 = new();     //脱战后还需要继续暂停多少tick
    private static readonly Dictionary<int, bool> 本tick可倒计时 = new();
    private static int 序号计数;

    public const int 排队间隔 = 60 * 60;    //聊天类台词间隔≥60s
    public const int 非聊天延后 = 5 * 60;   //出现“非聊天类”台词 → 聊天类冷却额外+5s
    public const int 脱战等待 = 5 * 60;     //脱战后需再等5s，台词计时器才恢复倒计时
    public const int 普通时长 = 4 * 60;     //普通台词显示4秒
    public const int 战斗时长 = 3 * 60;     //战斗台词显示3秒

    //===== 排队说话（闲聊/讨食等“聊天类”）：遵守 30s 间隔，多句排队 =====
    public static void 排队说话(NPC fox, string 内容)
    {
        if (fox == null || !fox.active) return;
        int who = fox.whoAmI;
        if (!队列.TryGetValue(who, out var q))
        {
            q = new Queue<string>();
            队列[who] = q;
        }
        q.Enqueue(内容);
    }

    //===== 直接说话（战斗/好痛/夸奖/寻宝/复活/喂食回应）：立即显示，不参与排队 =====
    //并按规则把“聊天类台词”的冷却再往后推 5s
    public static void 直接说话(NPC fox, string 内容, int 时长 = 普通时长)
    {
        if (fox == null || !fox.active) return;
        添加(fox.whoAmI, 内容, 时长);
        延后聊天(fox, 非聊天延后);
    }

    //把“聊天类台词”的下一次可排队时间往后推（已经在显示的台词不受影响）
    public static void 延后聊天(NPC fox, int tick)
    {
        if (fox == null || tick <= 0) return;
        int who = fox.whoAmI;
        int now = (int)Main.GameUpdateCount;
        int 基准 = (下次可排队.TryGetValue(who, out int next) && next > now) ? next : now;
        下次可排队[who] = 基准 + tick;
    }

    private static void 添加(int who, string 内容, int 时长)
    {
        if (!活动.TryGetValue(who, out var list))
        {
            list = new List<台词>();
            活动[who] = list;
        }
        //最多同时显示3条，超出则移除最旧
        if (list.Count >= 3) list.RemoveAt(0);
        list.Add(new 台词 { 文本 = 内容, 总时长 = 时长, 剩余 = 时长, 序号 = ++序号计数 });
    }

    //===== 每tick：计时门 + 衰减 + 队列推进 + 战斗台词 =====
    //★ 必须由酒狐 AI 每tick调用一次，而且要早于其它依赖“台词计时器可走”的计时器。
    public static void Update(NPC fox, Player owner)
    {
        if (fox == null) return;
        int who = fox.whoAmI;

        //========== 计时门：战斗中 / 脱战等待期内 → 所有台词计时器暂停 ==========
        bool 战斗中 = 酒狐攻击.IsInCombat()
            || (owner != null && 酒狐攻击.FindTarget(fox, owner) != null);
        bool 可倒计时;
        if (战斗中)
        {
            脱战保持[who] = 脱战等待;   //战斗中不断刷新，脱战后从这里开始倒数
            可倒计时 = false;
        }
        else if (脱战保持.TryGetValue(who, out int hold) && hold > 0)
        {
            脱战保持[who] = hold - 1;
            可倒计时 = false;           //脱战但还没等够时间，继续暂停
        }
        else
        {
            脱战保持.Remove(who);
            可倒计时 = true;
        }
        本tick可倒计时[who] = 可倒计时;

        //========== 衰减已有台词（始终进行：已经显示出来的台词要正常淡出）==========
        if (活动.TryGetValue(who, out var list))
        {
            for (int i = list.Count - 1; i >= 0; i--)
            {
                list[i].剩余--;
                if (list[i].剩余 <= 0) list.RemoveAt(i);
            }
            if (list.Count == 0) 活动.Remove(who);
        }

        //========== 聊天队列：只在“可倒计时”时推进（战斗/脱战等待期内排队等待）==========
        if (可倒计时 && 队列.TryGetValue(who, out var q) && q.Count > 0)
        {
            int now = (int)Main.GameUpdateCount;
            if (!下次可排队.TryGetValue(who, out int next) || now >= next)
            {
                string 内容 = q.Dequeue();
                添加(who, 内容, 普通时长);
                下次可排队[who] = now + 排队间隔;   //下一句至少60s后
                if (q.Count == 0) 队列.Remove(who);
            }
        }

        //========== 战斗台词（冷却同样受计时门影响）==========
        更新战斗台词(fox, owner, 可倒计时);
    }

    //供其它台词计时器查询：本tick是否允许倒计时（战斗中 / 脱战等待期内为 false）
    public static bool 台词计时器可走(NPC fox)
    {
        if (fox == null) return true;
        return !本tick可倒计时.TryGetValue(fox.whoAmI, out bool ok) || ok;
    }

    //是否有任何台词在显示
    public static bool 有台词(NPC fox)
        => fox != null && 活动.TryGetValue(fox.whoAmI, out var l) && l.Count > 0;

    //===== 绘制：浮现动画 + 叠放（越高越后面）=====
    public static void Draw(NPC fox, SpriteBatch sb, Vector2 screenPos)
    {
        if (Main.dedServ || fox == null) return;
        if (!活动.TryGetValue(fox.whoAmI, out var list) || list.Count == 0) return;
        var font = FontAssets.MouseText.Value;

        //按序号排序（越早说的越靠下）
        list.Sort((a, b) => a.序号.CompareTo(b.序号));
        //显示位置：贴近头顶
        float baseY = -(fox.height / 2f + 26f);
        for (int i = 0; i < list.Count; i++)
        {
            台词 t = list[i];
            float prog = 1f - t.剩余 / (float)t.总时长;          //0→1
            //浮现动画：从下往上浮起 + 淡入（前20%）淡出（后25%）
            float rise = 18f * (1f - MathF.Pow(1f - prog, 3f));   //easeOut 上浮
            float alpha = 1f;
            if (prog < 0.18f) alpha = prog / 0.18f;
            else if (prog > 0.75f) alpha = (1f - prog) / 0.25f;
            alpha = MathHelper.Clamp(alpha, 0f, 1f);

            //叠放：越靠上的台词（序号大）位置更高，每层约24px
            float layerY = baseY - (list.Count - 1 - i) * 24f;
            Vector2 pos = fox.Center - screenPos + new Vector2(0f, layerY - rise);
            Vector2 size = font.MeasureString(t.文本) * 0.8f;
            pos -= new Vector2(size.X / 2f, 0f);
            Utils.DrawBorderString(sb, t.文本, pos, new Color(255, 240, 200) * alpha, 0.8f);
        }
    }

    //战斗台词
    private static readonly Dictionary<int, int> 战斗台词冷却 = new();
    private static readonly string[] 战斗台词 = {
        "酒狐：有敌人！交给我吧！",
        "酒狐：主人小心，我来掩护你！",
        "酒狐：看我的，别想碰到主人！",
        "酒狐：来了个不怕死的，上！"
    };

    //由 Update 调用：战斗中可触发；冷却只在“可倒计时”（脱战且等够5s）时倒数
    private static void 更新战斗台词(NPC fox, Player owner, bool 可倒计时)
    {
        int who = fox.whoAmI;
        bool 战斗中 = 酒狐攻击.IsInCombat()
            || (owner != null && 酒狐攻击.FindTarget(fox, owner) != null);

        if (战斗中)
        {
            //战斗中：冷却不倒数；若已冷却好则说一句战斗台词
            if (!战斗台词冷却.TryGetValue(who, out int cd) || cd <= 0)
            {
                直接说话(fox, 战斗台词[Main.rand.Next(战斗台词.Length)], 战斗时长);
                战斗台词冷却[who] = 30 * 60;   //30s
            }
            return;
        }

        //脱战：要等“脱战等待”结束后才继续倒数
        if (!可倒计时) return;
        if (战斗台词冷却.TryGetValue(who, out int cd2) && cd2 > 0)
        {
            if (cd2 - 1 <= 0) 战斗台词冷却.Remove(who);
            else 战斗台词冷却[who] = cd2 - 1;
        }
    }

    public static void Clear()
    {
        活动.Clear();
        队列.Clear();
        下次可排队.Clear();
        脱战保持.Clear();
        本tick可倒计时.Clear();
        战斗台词冷却.Clear();
    }
}
