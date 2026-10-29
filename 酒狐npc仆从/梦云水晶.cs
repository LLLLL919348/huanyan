using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>梦云水晶——酒狐专属毕业饰品。</summary>
public sealed class 梦云水晶 : ModItem
{
    public override string Texture => "酒狐npc仆从/Content/Images/酒狐/梦云水晶";

    public override void SetStaticDefaults()
    {
        //「酒狐饰品」标签说明由 Localization/en-US_Mods.酒狐npc仆从.hjson 提供
    }

    public override void SetDefaults()
    {
        Item.width = 33;
        Item.height = 33;
        Item.accessory = true;          //饰品
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightPurple;
        Item.value = Item.buyPrice(gold: 5);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    //仅酒狐可用：玩家自己的饰品栏无法装备（酒狐通过其专属饰品槽佩戴，不受此限制）
    public override bool CanEquipAccessory(Player player, int slot, bool modded)
        => false;

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Zenith, 1)              //天顶剑
            .AddIngredient(ItemID.LastPrism, 1)           //终极棱镜
            .AddIngredient(ModContent.ItemType<法术强化核心>(), 1)   //法术强化核心
            .AddIngredient(ItemID.CrystalShard, 100)      //水晶碎块
            .AddIngredient(ItemID.Cloud, 20)              //云朵
            .AddIngredient(ItemID.AnkhShield, 1)          //十字章护盾
            .AddTile(TileID.CrystalBall)
            .Register();
    }
}
