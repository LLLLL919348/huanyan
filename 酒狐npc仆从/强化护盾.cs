using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.DataStructures;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 法术强化核心的护盾流光：环绕佩戴者旋转的紫色光带。
/// ai[0]=主人who（玩家whoAmI或fox.whoAmI），ai[1]=是否酒狐(1/0)，ai[2]=剩余护盾层数。
/// 一层：单条流光顺时针旋转；两层：两条流光反向旋转（相对旋转）。
/// </summary>
public sealed class 强化护盾 : ModProjectile
{
    public override string Texture => "酒狐npc仆从/Content/Images/酒狐/heart";   //资源占位

    public override void SetDefaults()
    {
        Projectile.width = 2;
        Projectile.height = 2;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;
        Projectile.ignoreWater = true;
        Projectile.penetrate = -1;
        Projectile.timeLeft = 120;
        Projectile.aiStyle = -1;
        Projectile.DamageType = DamageClass.Generic;
        //注意：不能设 hide=true，否则 Main.DrawProjectiles 不调用 PreDraw，流光不显示
        Projectile.hide = false;
    }

    private Player PlayerOwner => (int)Projectile.ai[0] >= 0 && (int)Projectile.ai[0] < Main.maxPlayers ? Main.player[(int)Projectile.ai[0]] : null;
    private NPC FoxOwner => (int)Projectile.ai[0] >= 0 && (int)Projectile.ai[0] < Main.maxNPCs ? Main.npc[(int)Projectile.ai[0]] : null;

    public override void AI()
    {
        bool isFox = (int)Projectile.ai[1] == 1;
        Vector2 center;
        if (isFox)
        {
            NPC fox = FoxOwner;
            if (fox == null || !fox.active) { Projectile.active = false; return; }
            //每帧重读层数（由 酒狐饰品.PostUpdateEverything 写入）
            Projectile.ai[2] = 酒狐饰品.取护盾层数(fox.whoAmI);
            center = fox.Center + new Vector2(0f, -6f);
        }
        else
        {
            Player p = PlayerOwner;
            if (p == null || !p.active) { Projectile.active = false; return; }
            Projectile.ai[2] = 酒狐饰品.取玩家护盾层数(p.whoAmI);
            center = p.Center;
        }

        Projectile.position = center - Projectile.Size / 2f;
        Projectile.timeLeft = 5;

        //流萤：少量紫色萤火粒子环绕飘散（不画任何持续图案，绝无“条/块”）
        int charges = (int)Projectile.ai[2];
        if (charges > 0 && !Main.dedServ)
        {
            float a = Main.rand.NextFloat(MathHelper.TwoPi);
            float rad = (isFox ? 34f : 30f) + Main.rand.NextFloat(0f, 20f);
            Vector2 o = center + new Vector2(MathF.Cos(a), MathF.Sin(a)) * rad;
            Dust d = Dust.NewDustPerfect(o, DustID.PurpleCrystalShard,
                new Vector2(Main.rand.NextFloat(-0.3f, 0.3f), Main.rand.NextFloat(-0.9f, -0.2f)), 0, new Color(190, 90, 255), 1.0f);
            d.noGravity = true;
            d.scale = Main.rand.NextFloat(0.5f, 0.9f);
            d.fadeIn = 0.4f;
        }
    }

    public override bool PreDraw(ref Color lightColor)
    {
        //纯粒子表现：这里不再绘制任何持续图案，直接返回 false（主体由 AI 的流萤粒子呈现）
        return false;
    }

    private void ParentCenter(bool isFox, out Vector2 center)
    {
        center = default;
        if (isFox)
        {
            NPC fox = FoxOwner;
            if (fox != null && fox.active) center = fox.Center;
        }
        else
        {
            Player p = PlayerOwner;
            if (p != null && p.active) center = p.Center;
        }
    }
}
