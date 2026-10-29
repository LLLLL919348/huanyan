using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 建筑预览：在酒狐搭建房屋/平台前，用半透明残影显示将要建造的形状。
/// ai[0]=锚点x(格)，ai[1]=任务类型(0=造房纸 1=搭平台)，ai[2]=当前阶段进度。
/// 仅作视觉预告，不参与碰撞。
/// </summary>
public sealed class 建筑预览 : ModProjectile
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
        //不能 hide=true，否则 PreDraw 不会被调用，投影看不到
        Projectile.hide = false;
    }

    public override void AI()
    {
        Projectile.timeLeft = 5;   //维持（由酒狐任务执行持续调用刷新时机）

        // 超时兜底：若预览存在超过 10s(600tick) 仍未被“任务完成/取消”正常关闭，则强制移除（防止投影残留）
        Projectile.localAI[0] += 1f;
        if (Projectile.localAI[0] > 600f)
            Projectile.Kill();
    }

    public override bool PreDraw(ref Color lightColor)
    {
        int ax = (int)Projectile.ai[0];
        int type = (int)Projectile.ai[1];
        if (ax <= 0) return false;

        Color ghost = type == 0 ? new Color(180, 150, 100) : new Color(150, 170, 200);
        ghost *= 0.42f;

        if (type == 0)
        {
            //造房纸：17宽 × (地板+墙+屋顶) 轮廓（与 行为造房纸 的尺寸一致）
            int x1 = ax - 8, x2 = ax + 8;
            int gy = (int)Projectile.ai[2];
            int floorY = gy - 1, wallTop = floorY - 5, roofY = floorY - 6;
            for (int x = x1; x <= x2; x++)
            {
                DrawGhostTile(x, floorY, ghost);       //地板
                DrawGhostTile(x, roofY, ghost);         //屋顶
            }
            for (int y = wallTop; y <= floorY - 1; y++)
            {
                DrawGhostTile(x1, y, ghost);            //左墙
                DrawGhostTile(x2, y, ghost);            //右墙
                DrawGhostWall(ax, y, ghost);            //门洞背景墙（中央）
            }
        }
        else
        {
            //搭平台：显示将要铺设的整片平台栈（每层长度x、层间垂直间隔y、共堆叠层）
            int y = (int)Projectile.ai[2];
            int len = 酒狐任务配置.取搭平台长度();
            int step = 酒狐任务配置.取搭平台间距();
            int stack = 酒狐任务配置.取搭平台层数();
            for (int i = 0; i < stack; i++)
            {
                int ly = y - i * step;
                for (int dx = -len / 2; dx < len / 2; dx++)
                    DrawGhostTile(ax + dx, ly, ghost);
            }
        }
        return false;
    }

    private void DrawGhostTile(int x, int y, Color color)
    {
        if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) return;
        Vector2 pos = new Vector2(x * 16f, y * 16f) - Main.screenPosition;
        Main.spriteBatch.Draw(TextureAssets.MagicPixel.Value, pos, new Rectangle(0, 0, 16, 16), color * 0.7f, 0f, Vector2.Zero, new Vector2(16f, 16f), SpriteEffects.None, 0f);
    }
    private void DrawGhostWall(int x, int y, Color color)
    {
        if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) return;
        Vector2 pos = new Vector2(x * 16f, y * 16f) - Main.screenPosition;
        Main.spriteBatch.Draw(TextureAssets.MagicPixel.Value, pos + new Vector2(4f, 4f), new Rectangle(0, 0, 8, 8), color * 0.35f, 0f, Vector2.Zero, new Vector2(8f, 8f), SpriteEffects.None, 0f);
    }
}
