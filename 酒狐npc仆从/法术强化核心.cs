using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>法术强化核心——法术伤害+50%、魔力值+200、魔法恢复+50%；每30s获得一层可免疫一次伤害的护盾，最多两层</summary>
public sealed class 法术强化核心 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/spell_enhancement_core_big";

    public override void SetStaticDefaults()
    {
        //8帧垂直序列：核心旋转流光动画
        Main.itemAnimations[Item.type] = new DrawAnimationVertical(6, 8);
    }

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Red;
        Item.value = Item.buyPrice(gold: 20);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.HoundiusShootius, 1)   //眼球激光塔（鹿角怪掉落）
            .AddIngredient(ItemID.WizardHat, 1)          //巫师帽
            .AddIngredient(ItemID.CrystalBall, 1)        //水晶球
            .AddIngredient(ItemID.DestroyerEmblem, 1)    //毁灭者徽章
            .AddIngredient(ItemID.RazorbladeTyphoon, 1)  //利刃台风（猪龙鱼公爵掉落）
            .AddRecipeGroup("酒狐npc仆从:LargeGem", 1)   //任意大宝石x1
            .AddTile(TileID.LunarCraftingStation)         //远古操纵机
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(200, 110, 255);
                break;
            }
        }
    }
}
