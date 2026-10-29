using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ModLoader;
using Terraria.UI;

namespace 酒狐npc仆从;

public sealed class 酒狐互动系统 : ModSystem
{
    internal static readonly UserInterface Interface = new();
    internal static readonly 酒狐互动UI State = new();

    internal static readonly UserInterface 任务Interface = new();
    internal static readonly 酒狐任务UI 任务State = new();

    internal static readonly UserInterface 图鉴Interface = new();
    internal static readonly 酒狐图鉴UI 图鉴State = new();

    public override void ModifyInterfaceLayers(List<GameInterfaceLayer> layers)
    {
        int index = layers.FindIndex(layer => layer.Name.Equals("Vanilla: Mouse Text"));
        if (index < 0)
            index = layers.Count;

        layers.Insert(index, new LegacyGameInterfaceLayer("酒狐npc仆从: 互动", () =>
        {
            if (Interface.CurrentState != null)
                Interface.Draw(Main.spriteBatch, new GameTime());
            if (任务Interface.CurrentState != null)
                任务Interface.Draw(Main.spriteBatch, new GameTime());
            if (图鉴Interface.CurrentState != null)
                图鉴Interface.Draw(Main.spriteBatch, new GameTime());
            return true;
        }, InterfaceScaleType.UI));
    }

    public override void UpdateUI(GameTime gameTime)
    {
        //====按 ESC / 空格 关闭所有酒狐 UI（互动/任务/图鉴）====
        if (Interface.CurrentState != null || 任务Interface.CurrentState != null || 图鉴Interface.CurrentState != null)
        {
            Main.LocalPlayer.mouseInterface = true;
            if (按关闭键())
            {
                Interface.SetState(null);
                任务Interface.SetState(null);
                图鉴Interface.SetState(null);
                酒狐互动UI.OnClosedByKey();
            }
        }

        if (Interface.CurrentState != null || 任务Interface.CurrentState != null || 图鉴Interface.CurrentState != null)
            Main.LocalPlayer.mouseInterface = true;
        Interface.Update(gameTime);
        任务Interface.Update(gameTime);
        图鉴Interface.Update(gameTime);
    }

    //ESC 或 空格（跳跃键按下那一帧）触发关闭
    private static bool closeKeyHeld;
    private static bool 按关闭键()
    {
        //空格 = 跳跃键按下那一帧
        bool jump = Main.LocalPlayer.controlJump;
        bool jumpPressed = jump && !closeKeyHeld;
        closeKeyHeld = jump;
        if (jumpPressed) return true;

        //ESC = 键盘 Escape（按下那一帧）
        var k = Microsoft.Xna.Framework.Input.Keyboard.GetState();
        bool esc = k.IsKeyDown(Microsoft.Xna.Framework.Input.Keys.Escape);
        if (esc && !escapeHeld) { escapeHeld = true; return true; }
        if (!esc) escapeHeld = false;
        return false;
    }
    private static bool escapeHeld;
}