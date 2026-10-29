using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.GameContent;
using Terraria.GameContent.UI.Elements;
using Terraria.ModLoader;
using Terraria.UI;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐任务界面：两个视图（任务列表 / 任务单）。
/// 任务列表：列 任务列表 | 任务状态 | X（关闭该任务）；底部“新建任务”。
/// 任务单：列出每种任务 + 需求，点 + 加入列表并回到列表视图（状态=测试中）。
/// </summary>
public sealed class 酒狐任务UI : UIState
{
    private bool createMode;   //true=任务单，false=任务列表

    public static void Open()
    {
        酒狐互动系统.任务Interface.SetState(酒狐互动系统.任务State);
        酒狐互动系统.任务State.Rebuild();
    }

    public override void OnInitialize()
    {
        Rebuild();
    }

    public override void Update(GameTime gameTime)
    {
        Main.LocalPlayer.mouseInterface = true;
        base.Update(gameTime);
    }

    public void Rebuild()
    {
        RemoveAllChildren();

        //主面板（可拖动）
        UIPanel panel = new 可拖动面板
        {
            BackgroundColor = new Color(26, 30, 46, 220),
            BorderColor = new Color(140, 150, 200, 110)
        };
        panel.Left.Set(Main.screenWidth / 2f - 330f, 0f);
        panel.Top.Set(Main.screenHeight / 2f - 240f, 0f);
        panel.Width.Set(660f, 0f);
        panel.Height.Set(480f, 0f);
        Append(panel);

        if (createMode)
            新建任务视图(panel);
        else
            任务列表视图(panel);
    }

    //==================== 任务列表视图 ====================
    private void 任务列表视图(UIPanel panel)
    {
        UIText title = new("任务", 1.15f)
        {
            TextColor = new Color(140, 200, 255),
            HAlign = 0.5f
        };
        title.Top.Set(16f, 0f);
        panel.Append(title);

        AddClose(panel, CloseAll, 620f);

        //列头
        UIText colTask = new("任务列表") { TextColor = new Color(120, 180, 255) };
        colTask.Left.Set(40f, 0f); colTask.Top.Set(64f, 0f);
        panel.Append(colTask);
        UIText colStatus = new("任务状态") { TextColor = new Color(120, 180, 255) };
        colStatus.Left.Set(330f, 0f); colStatus.Top.Set(64f, 0f);
        panel.Append(colStatus);

        List<任务记录> list = 酒狐任务系统.主玩家列表();
        float rowY = 100f;
        if (list.Count == 0)
        {
            UIText empty1 = new("空") { TextColor = new Color(120, 120, 140) };
            empty1.Left.Set(44f, 0f); empty1.Top.Set(rowY + 20f, 0f);
            panel.Append(empty1);
            UIText empty2 = new("空") { TextColor = new Color(120, 120, 140) };
            empty2.Left.Set(334f, 0f); empty2.Top.Set(rowY + 20f, 0f);
            panel.Append(empty2);
        }
        else
        {
            for (int i = 0; i < list.Count; i++)
            {
                任务记录 r = list[i];
                float y = rowY + i * 58f;
                //行底
                UIPanel row = new()
                {
                    BackgroundColor = new Color(38, 44, 66, 160),
                    BorderColor = new Color(90, 110, 160, 70)
                };
                row.Left.Set(30f, 0f); row.Top.Set(y, 0f);
                row.Width.Set(600f, 0f); row.Height.Set(48f, 0f);
                panel.Append(row);

                UIText name = new(任务定义.名称(r.类型)) { TextColor = new Color(220, 230, 255) };
                name.Left.Set(14f, 0f); name.Top.Set(12f, 0f);
                row.Append(name);

                UIText status = new(r.状态) { TextColor = new Color(255, 200, 120) };
                status.Left.Set(300f, 0f); status.Top.Set(12f, 0f);
                row.Append(status);

                //关闭该任务的 X（垂直居中于 48px 行：Top=9）
                任务记录 rec = list[i];
                UIText removeX = new("X") { TextColor = new Color(255, 120, 120) };
                removeX.Left.Set(560f, 0f); removeX.Top.Set(9f, 0f);
                removeX.Width.Set(30f, 0f); removeX.Height.Set(30f, 0f);
                removeX.OnLeftClick += (evt, el) => {
                    try { 酒狐任务系统.移除任务(Main.LocalPlayer, rec); }
                    catch { }
                    Rebuild();
                };
                row.Append(removeX);
            }
        }

        //底部“新建任务”
        float bottomY = 200 + list.Count * 58f;
        if (bottomY < 380f) bottomY = 380f;
        UITextPanel<string> create = new("新建任务", 0.9f, true)
        {
            BackgroundColor = new Color(60, 90, 140, 180),
            BorderColor = new Color(150, 190, 240, 120)
        };
        create.Left.Set(230f, 0f); create.Top.Set(bottomY, 0f);
        create.Width.Set(200f, 0f); create.Height.Set(46f, 0f);
        create.OnLeftClick += OpenCreate;
        panel.Append(create);
    }

    //==================== 任务单视图 ====================
    private void 新建任务视图(UIPanel panel)
    {
        UIText title = new("任务单", 1.15f)
        {
            TextColor = new Color(140, 200, 255),
            HAlign = 0.5f
        };
        title.Top.Set(16f, 0f);
        panel.Append(title);

        AddClose(panel, CloseAll, 620f);

        //列头：任务 | 任务需求
        UIText colTask = new("任务") { TextColor = new Color(120, 180, 255) };
        colTask.Left.Set(40f, 0f); colTask.Top.Set(64f, 0f);
        panel.Append(colTask);
        UIText colReq = new("任务需求") { TextColor = new Color(120, 180, 255) };
        colReq.Left.Set(180f, 0f); colReq.Top.Set(64f, 0f);
        panel.Append(colReq);

        List<任务类型> types = new(任务定义.全部类型);
        for (int i = 0; i < types.Count; i++)
        {
            任务类型 type = types[i];
            float y = 100f + i * 50f;
            UIPanel row = new()
            {
                BackgroundColor = new Color(38, 44, 66, 160),
                BorderColor = new Color(90, 110, 160, 70)
            };
            row.Left.Set(30f, 0f); row.Top.Set(y, 0f);
            row.Width.Set(600f, 0f); row.Height.Set(44f, 0f);
            panel.Append(row);

            UIText name = new(任务定义.名称(type)) { TextColor = new Color(220, 230, 255) };
            name.Left.Set(14f, 0f); name.Top.Set(13f, 0f);
            row.Append(name);

            UIText req = new(任务定义.需求(type)) { TextColor = new Color(180, 200, 220) };
            req.Left.Set(150f, 0f); req.Top.Set(13f, 0f);
            row.Append(req);

            //+ 加入任务列表（用普通字体，精确垂直居中对齐到行）
            任务类型 captured = type;
            UITextPanel<string> plus = new("+", 0.9f, false)
            {
                BackgroundColor = new Color(70, 120, 80, 180),
                BorderColor = new Color(140, 220, 150, 120)
            };
            plus.Left.Set(558f, 0f); plus.Top.Set(6f, 0f);
            plus.Width.Set(32f, 0f); plus.Height.Set(32f, 0f);
            plus.OnLeftClick += (evt, el) => onClickPlus(captured);
            row.Append(plus);
        }
    }

    private void onClickPlus(任务类型 type)
    {
        //加入列表成功→回到列表视图；若已存在→提示
        if (酒狐任务系统.添加任务(Main.LocalPlayer, type))
        {
            createMode = false;
            Rebuild();
        }
        else
        {
            Main.NewText("该任务已在任务列表中", new Color(255, 180, 120));
        }
    }

    private void OpenCreate(UIMouseEvent evt, UIElement element)
    {
        createMode = true;
        Rebuild();
    }

    private void CloseAll(UIMouseEvent evt, UIElement element)
    {
        酒狐互动系统.任务Interface.SetState(null);
    }

    private void AddClose(UIPanel panel, UIElement.MouseEvent click, float x)
    {
        UIText close = new("X") { TextColor = new Color(255, 120, 120) };
        close.Left.Set(x, 0f); close.Top.Set(8f, 0f);
        close.Width.Set(28f, 0f); close.Height.Set(30f, 0f);
        close.OnLeftClick += click;
        panel.Append(close);
    }
}
