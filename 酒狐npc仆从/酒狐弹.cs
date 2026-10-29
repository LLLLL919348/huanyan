using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>酒狐统一弹幕：由酒狐自行发射的能量弹，不读任何玩家手持物品，由 酒狐弹幕修正 导航瞄准目标。</summary>
public sealed class 酒狐弹 : ModProjectile
{
    // 仅作为资源占位（正式绘制用 MagicPixel 拼出光球）
    public override string Texture => "酒狐npc仆从/Content/Images/酒狐/heart";

    public override void SetDefaults()
    {
        Projectile.width = 14;
        Projectile.height = 14;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;
        Projectile.ignoreWater = true;
        Projectile.penetrate = 3;
        Projectile.timeLeft = 180;
        Projectile.scale = 1f;
        Projectile.aiStyle = -1;
        Projectile.DamageType = DamageClass.Magic;
    }

    public override void AI()
    {
        // 前方拖尾光点
        if (Main.rand.NextBool(2))
        {
            int d = Dust.NewDust(Projectile.position, Projectile.width, Projectile.height, DustID.Silver, 0, 0, 0, new Color(150, 130, 255), 0.9f);
            Dust dd = Main.dust[d];
            dd.noGravity = true;
            dd.velocity *= 0.3f;
        }
    }

    public override bool PreDraw(ref Color lightColor)
    {
        Vector2 pos = Projectile.Center - Main.screenPosition;
        Color color = new Color(170, 130, 255);
        // 外层椭圆光晕 + 内芯亮点
        Main.spriteBatch.Draw(TextureAssets.MagicPixel.Value, pos, null, color * 0.6f, 0f, new Vector2(0.5f, 0.5f), new Vector2(22f, 22f), SpriteEffects.None, 0f);
        Main.spriteBatch.Draw(TextureAssets.MagicPixel.Value, pos, null, color, 0f, new Vector2(0.5f, 0.5f), new Vector2(12f, 12f), SpriteEffects.None, 0f);
        Main.spriteBatch.Draw(TextureAssets.MagicPixel.Value, pos, null, Color.White * 0.85f, 0f, new Vector2(0.5f, 0.5f), new Vector2(5f, 5f), SpriteEffects.None, 0f);
        return false;
    }
}
