using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;

namespace 酒狐npc仆从;

/// <summary>
/// 特殊武器特效：天顶剑/终极棱镜/鞭子 均由酒狐本体驱动（不从玩家身上发射弹幕）。
/// 全部锚定在酒狐身上、以酒狐为原点，朝酒狐的攻击目标生效。
/// </summary>
public static class 酒狐武器特效
{
    private const int ZenithDuration = 120;
    private const int ZenithHitInterval = 22;
    private const float ZenithRadius = 80f;

    private const int PrismDuration = 110;
    private const int PrismHitInterval = 7;

    private const int WhipDuration = 40;
    private const int WhipHitInterval = 16;

    private sealed class State
    {
        public int ZenithTicks;
        public float ZenithAngle;
        public int ZenithHitTimer;

        public int PrismTicks;
        public int PrismHitTimer;

        public int WhipTicks;
        public int WhipHitTimer;
    }
    private static readonly Dictionary<int, State> states = new();

    private static State GetState(NPC npc)
    {
        if (!states.TryGetValue(npc.whoAmI, out State s))
        {
            s = new State();
            states[npc.whoAmI] = s;
        }
        return s;
    }

    public static bool IsZenithActive(NPC npc) => GetState(npc).ZenithTicks > 0;
    public static bool IsChanneling(NPC npc) => GetState(npc).PrismTicks > 0;
    public static bool IsWhipActive(NPC npc) => GetState(npc).WhipTicks > 0;

    public static void TriggerZenith(int npcIndex)
    {
        if (npcIndex < 0 || npcIndex >= Main.maxNPCs) return;
        State s = StateOf(npcIndex);
        s.ZenithTicks = ZenithDuration;
        s.ZenithAngle = 0f;
        s.ZenithHitTimer = 0;
    }

    public static void TriggerPrism(int npcIndex)
    {
        if (npcIndex < 0 || npcIndex >= Main.maxNPCs) return;
        State s = StateOf(npcIndex);
        s.PrismTicks = PrismDuration;
        s.PrismHitTimer = 0;
    }

    public static void TriggerWhip(int npcIndex)
    {
        if (npcIndex < 0 || npcIndex >= Main.maxNPCs) return;
        State s = StateOf(npcIndex);
        s.WhipTicks = WhipDuration;
        s.WhipHitTimer = 0;
    }

    private static State StateOf(int npcIndex)
    {
        if (!states.TryGetValue(npcIndex, out State s))
        {
            s = new State();
            states[npcIndex] = s;
        }
        return s;
    }

    public static void Unload() => states.Clear();

    //每帧驱动伤害逻辑（服务端执行）
    public static void Update(NPC npc)
    {
        State s = GetState(npc);
        Player owner = 酒狐NPC状态.GetTargetPlayer(npc);
        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;
        if (weapon.IsAir) return;
        NPC target = 酒狐攻击.FindTarget(npc, owner);

        if (s.ZenithTicks > 0)
        {
            s.ZenithAngle += 0.18f;
            s.ZenithTicks--;
            if (--s.ZenithHitTimer <= 0)
            {
                s.ZenithHitTimer = ZenithHitInterval;
                HitEnemiesInRadius(npc, owner, weapon, ZenithRadius);
            }
        }

        if (s.PrismTicks > 0)
        {
            s.PrismTicks--;
            if (--s.PrismHitTimer <= 0)
            {
                s.PrismHitTimer = PrismHitInterval;
                if (target != null)
                    HitAlongLine(npc, owner, weapon, target);
            }
        }

        if (s.WhipTicks > 0)
        {
            s.WhipTicks--;
            //只在向前甩出（前一半）时造成伤害
            bool extending = s.WhipTicks > WhipDuration * 0.4f;
            if (extending && --s.WhipHitTimer <= 0)
            {
                s.WhipHitTimer = WhipHitInterval;
                if (target != null)
                    HitAlongLine(npc, owner, weapon, target);
            }
            else if (!extending)
            {
                s.WhipHitTimer = WhipHitInterval;
            }
        }
    }

    //范围内命中（天顶剑环绕）
    private static void HitEnemiesInRadius(NPC npc, Player owner, Item weapon, float radius)
    {
        int damage = Math.Max(1, owner.GetWeaponDamage(weapon));
        float knockback = owner.GetWeaponKnockback(weapon, weapon.knockBack);
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC e = Main.npc[i];
            if (!e.active || e.friendly || e.townNPC || NPCID.Sets.CountsAsCritter[e.type] || e.dontTakeDamage || e.life <= 0 || e.type == npc.type)
                continue;
            if (Vector2.Distance(npc.Center, e.Center) > radius) continue;
            int dir = npc.Center.X < e.Center.X ? 1 : -1;
            e.SimpleStrikeNPC(damage, dir, false, knockback, weapon.DamageType);
        }
    }

    //沿 酒狐→目标 直线命中（棱镜光束 / 鞭子挥击）
    private static void HitAlongLine(NPC npc, Player owner, Item weapon, NPC target)
    {
        int damage = Math.Max(1, owner.GetWeaponDamage(weapon));
        float knockback = owner.GetWeaponKnockback(weapon, weapon.knockBack);
        float maxDist = Vector2.Distance(npc.Center, target.Center) + 20f;
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC e = Main.npc[i];
            if (!e.active || e.friendly || e.townNPC || NPCID.Sets.CountsAsCritter[e.type] || e.dontTakeDamage || e.life <= 0 || e.type == npc.type)
                continue;
            if (Vector2.Distance(npc.Center, e.Center) > maxDist) continue;
            //点到直线(酒狐→目标)的距离
            float lineDist = PointLineDistance(e.Center, npc.Center, target.Center);
            if (lineDist > 46f) continue;
            int dir = npc.Center.X < e.Center.X ? 1 : -1;
            e.SimpleStrikeNPC(damage, dir, false, knockback, weapon.DamageType);
        }
    }

    private static float PointLineDistance(Vector2 p, Vector2 a, Vector2 b)
    {
        Vector2 ab = b - a;
        if (ab.LengthSquared() < 0.01f) return Vector2.Distance(p, a);
        float t = MathHelper.Clamp(Vector2.Dot(p - a, ab) / ab.LengthSquared(), 0f, 1f);
        return Vector2.Distance(p, a + ab * t);
    }

    //绘制（客户端）
    public static void Draw(NPC npc, SpriteBatch sb, Vector2 screenPos)
    {
        State s = GetState(npc);
        Player owner = 酒狐NPC状态.GetTargetPlayer(npc);
        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;

        if (s.ZenithTicks > 0)
            DrawZenith(npc, sb, screenPos, s);
        if (s.PrismTicks > 0)
            DrawPrism(npc, sb, screenPos, s);
        if (s.WhipTicks > 0 && !weapon.IsAir)
            DrawWhip(npc, sb, screenPos, s, weapon);
    }

    private static void DrawZenith(NPC npc, SpriteBatch sb, Vector2 screenPos, State s)
    {
        Texture2D tex = TextureAssets.Item[ItemID.Zenith].Value;
        Vector2 center = npc.Center - screenPos;
        const int swordCount = 6;
        for (int i = 0; i < swordCount; i++)
        {
            float ang = s.ZenithAngle + i * (MathHelper.TwoPi / swordCount);
            Vector2 pos = center + new Vector2(MathF.Cos(ang), MathF.Sin(ang)) * 48f;
            sb.Draw(tex, pos, null, Color.White, ang + MathF.PI / 2f, new Vector2(tex.Width / 2f, tex.Height * 0.7f), 0.6f, SpriteEffects.None, 0f);
        }
    }

    private static void DrawPrism(NPC npc, SpriteBatch sb, Vector2 screenPos, State s)
    {
        float charge = 1f - s.PrismTicks / (float)PrismDuration;  //0→1蓄力
        Vector2 a = npc.Center - screenPos + new Vector2(0, 4);
        Vector2 dir = new Vector2(npc.spriteDirection, 0);
        NPC target = 酒狐攻击.FindTarget(npc, 酒狐NPC状态.GetTargetPlayer(npc));
        if (target != null)
        {
            Vector2 tb = target.Center - screenPos;
            if (tb != a) dir = Vector2.Normalize(tb - a);
        }
        Vector2 b = a + dir * (460f + charge * 200f);
        float thickness = 3f + 14f * charge;
        float alpha = 0.5f + 0.4f * charge;
        Color color = new Color(140, 210, 255) * alpha;
        //用 1x1 像素拉伸成光束
        sb.Draw(TextureAssets.MagicPixel.Value, a, null, color, (b - a).ToRotation(), new Vector2(0f, 0.5f), new Vector2(Vector2.Distance(a, b), thickness), SpriteEffects.None, 0f);
        //内芯更亮
        Color core = new Color(255, 255, 255) * (0.7f * charge);
        sb.Draw(TextureAssets.MagicPixel.Value, a, null, core, (b - a).ToRotation(), new Vector2(0f, 0.5f), new Vector2(Vector2.Distance(a, b), thickness * 0.35f), SpriteEffects.None, 0f);
    }

    private static void DrawWhip(NPC npc, SpriteBatch sb, Vector2 screenPos, State s, Item weapon)
    {
        Texture2D tex = TextureAssets.Item[weapon.type].Value;
        NPC target = 酒狐攻击.FindTarget(npc, 酒狐NPC状态.GetTargetPlayer(npc));
        if (target == null) return;
        Vector2 a = npc.Center - screenPos;
        Vector2 tb = target.Center - screenPos;
        Vector2 dir = Vector2.Normalize(tb - a);
        float progress = 1f - s.WhipTicks / (float)WhipDuration;  //0→1甩出
        float reach = Vector2.Distance(npc.Center, target.Center);
        //先伸长后收回
        float lenFrac = progress < 0.5f ? progress * 2f : (1f - progress) * 2f;
        Vector2 tip = a + dir * reach * MathHelper.Clamp(lenFrac, 0f, 1f);
        float rot = dir.ToRotation() + MathF.PI / 2f;
        sb.Draw(tex, tip, null, Color.White, rot, new Vector2(tex.Width / 2f, tex.Height / 2f), 0.9f, SpriteEffects.None, 0f);
    }
}
