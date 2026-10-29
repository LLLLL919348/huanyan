using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>法术强化核心附带的魔法箭：普攻/远程攻击时额外召唤，自动追踪目标，伤害在基础伤害上额外+200，紫色流光箭矢。</summary>
public sealed class 法术魔法箭 : ModProjectile
{
    public override string Texture => "酒狐npc仆从/Content/Images/酒狐/heart";   //资源占位，实际用 MagicPixel 绘制

    public override void SetDefaults()
    {
        Projectile.width = 16;
        Projectile.height = 16;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;
        Projectile.ignoreWater = true;
        Projectile.penetrate = 1;
        Projectile.timeLeft = 240;
        Projectile.scale = 0.9f;
        Projectile.aiStyle = -1;
        Projectile.DamageType = DamageClass.Magic;
        Projectile.extraUpdates = 1;
    }

    public override void AI()
    {
        //尖端朝向：速度方向
        if (Projectile.velocity != Vector2.Zero)
            Projectile.rotation = Projectile.velocity.ToRotation() + MathHelper.PiOver2;

        //柔和追踪最近的敌对NPC
        float closest = 480f * 480f;
        int target = -1;
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC npc = Main.npc[i];
            if (!npc.active || npc.friendly || npc.dontTakeDamage || npc.life <= 0)
                continue;
            float dist = Vector2.DistanceSquared(Projectile.Center, npc.Center);
            if (dist < closest) { closest = dist; target = i; }
        }
        if (target >= 0)
        {
            Vector2 desired = Main.npc[target].Center - Projectile.Center;
            if (desired != Vector2.Zero)
            {
                float speed = Projectile.velocity.Length();
                if (speed < 1f) speed = 14f;
                desired.Normalize();
                desired *= speed;
                Projectile.velocity = Vector2.Lerp(Projectile.velocity, desired, 0.22f);
            }
        }

        //紫色拖尾
        if (Main.rand.NextBool(2))
        {
            Dust d = Dust.NewDustDirect(Projectile.position, Projectile.width, Projectile.height, DustID.PurpleCrystalShard, 0, 0, 0, new Color(190, 110, 255), 1.1f);
            d.noGravity = true;
            d.velocity *= 0.3f;
        }
    }

    public override bool PreDraw(ref Color lightColor)
    {
        //直接用原版「木箭」弹幕贴图染色成紫色：真实箭形，不是色块
        Vector2 pos = Projectile.Center - Main.screenPosition;
        float rot = Projectile.velocity.ToRotation() + MathHelper.PiOver2;   //贴图尖端朝上
        Texture2D tex = TextureAssets.Projectile[ProjectileID.WoodenArrowFriendly].Value;
        Color tint = new Color(210, 120, 255);
        Main.spriteBatch.Draw(tex, pos, null, tint, rot, new Vector2(tex.Width / 2f, tex.Height / 2f), 1f, SpriteEffects.None, 0f);
        return false;
    }
}
