using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>嗜血之心——造成伤害的5%回血；玩家佩戴时恢复值减半。</summary>
public sealed class 嗜血之心 : ModItem
{
    //使用文件里的垂直动画序列（10帧心跳动画），居中放大使其清晰醒目
    public override string Texture => "酒狐npc仆从/饰品/bleeding_heart_anim";

    public override void SetStaticDefaults()
    {
        //物品图标/掉落物用该垂直序列做心跳动画（每帧8tick，共10帧）
        Main.itemAnimations[Item.type] = new DrawAnimationVertical(8, 10);
    }

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightRed;
        Item.value = Item.buyPrice(gold: 2);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 62, 62);   //红色字体
                break;
            }
        }
    }
}
