using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐头顶表情：使用与酒狐本体贴图(PetpetSheet)完全相同的加载/绘制方式。
/// 贴图由 酒狐.EmoteAssets 在 ModNPC.Load 里用 ModContent.Request 加载。
/// </summary>
public static class 酒狐表情
{
    private const int EmoteInterval = 900;   //表情之间约15秒
    private const int EmoteDuration = 180;   //显示约3秒
    private const int FrameSize = 64;

    private static readonly Dictionary<int, EmoteState> States = new();
    private sealed class EmoteState
    {
        public int ActiveIndex = -1;
        public int Timer;
        public int Cooldown;
        public int SecondCounter;
    }

    private static EmoteState GetState(NPC npc)
    {
        if (!States.TryGetValue(npc.whoAmI, out EmoteState s))
        {
            s = new EmoteState();
            States[npc.whoAmI] = s;
        }
        return s;
    }

    public static void Unload()
    {
        States.Clear();
    }

    public static void Update(NPC npc)
    {
        if (Main.dedServ) return;
        if (酒狐NPC状态.GetMode(npc) == 酒狐状态.坐下) return;
        if (酒狐.EmoteAssets.Length == 0) return;
        EmoteState st = GetState(npc);
        if (st.ActiveIndex >= 0)
        {
            st.Timer--;
            if (st.Timer <= 0) st.ActiveIndex = -1;
            return;
        }
        if (st.Cooldown > 0) { st.Cooldown--; return; }

        //恢复原来频率：每秒5%概率
        st.SecondCounter++;
        if (st.SecondCounter >= 60)
        {
            st.SecondCounter = 0;
            if (Main.rand.NextFloat() < 0.15f)
            {
                st.ActiveIndex = Main.rand.Next(酒狐.EmoteAssets.Length);
                st.Timer = EmoteDuration;
                st.Cooldown = EmoteInterval;
            }
        }
    }

    public static void Draw(NPC npc, SpriteBatch spriteBatch, Vector2 screenPos)
    {
        if (!States.TryGetValue(npc.whoAmI, out EmoteState st) || st.ActiveIndex < 0) return;
        Asset<Texture2D> asset = 酒狐.EmoteAssets[st.ActiveIndex];
        if (asset == null) return;
        Texture2D tex = asset.Value;
        if (tex == null) return;

        //按贴图实际尺寸自适应缩放到 FrameSize(64)
        float scale = FrameSize / (float)Math.Max(1, tex.Width);
        Vector2 origin = new Vector2(tex.Width / 2f, tex.Height / 2f);

        Vector2 center = npc.Center - screenPos + new Vector2(0f, -(npc.height / 2f + 28f));
        SpriteEffects effects = npc.spriteDirection == 1 ? SpriteEffects.None : SpriteEffects.FlipHorizontally;
        spriteBatch.Draw(tex, center, null, Color.White, 0f, origin, scale, effects, 0f);
    }
}
