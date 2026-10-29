using Terraria;
using Terraria.ModLoader;
using Terraria.ModLoader.Config;

namespace 酒狐npc仆从;

/// <summary>酒狐任务相关配置。玩家可在模组配置里自行调整。</summary>
public class 酒狐任务配置 : ModConfig
{
    public override ConfigScope Mode => ConfigScope.ClientSide;

    [Header("搭平台")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台最大长度.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台最大长度.Tooltip")]
    [Range(2, 500)]
    [Increment(1)]
    public int 搭平台最大长度 = 100;
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台垂直间距.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台垂直间距.Tooltip")]
    [Range(2, 50)]
    [Increment(1)]
    public int 搭平台垂直间距 = 7;

    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台堆叠次数.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.搭平台堆叠次数.Tooltip")]
    [Range(1, 20)]
    [Increment(1)]
    public int 搭平台堆叠次数 = 8;

    [Header("主动防御")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.主动防御最大索敌距离.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.主动防御最大索敌距离.Tooltip")]
    [Range(16, 200)]
    [Increment(1)]
    public int 主动防御最大索敌距离 = 80;

    [Header("采种")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.采种种下间隔.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.采种种下间隔.Tooltip")]
    [Range(10, 600)]
    [Increment(5)]
    public int 采种种下间隔 = 40;

    [Header("界面")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.打开饰品图鉴.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.打开饰品图鉴.Tooltip")]
    public bool 打开饰品图鉴;

    [Header("行为")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.酒狐拾取钱币星星.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.酒狐拾取钱币星星.Tooltip")]
    public bool 酒狐拾取钱币星星 = true;

    [Header("外观")]
    [LabelKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.使用新皮肤.Label")]
    [TooltipKey("$Mods.酒狐npc仆从.Configs.酒狐任务配置.使用新皮肤.Tooltip")]
    public bool 使用新皮肤;

    // 配置里勾选“打开饰品图鉴”→ 打开图鉴界面，然后自动复位（不会重复打开）
    public override void OnChanged()
    {
        //【修复：重置为默认值后数值变成0】——若三个搭平台数值因重置变成0，恢复为合理默认
        if (搭平台最大长度 <= 0) 搭平台最大长度 = 100;
        if (搭平台垂直间距 <= 0) 搭平台垂直间距 = 7;
        if (搭平台堆叠次数 <= 0) 搭平台堆叠次数 = 8;

        if (打开饰品图鉴)
        {
            打开饰品图鉴 = false;
            if (Main.netMode != Terraria.ID.NetmodeID.Server && Main.LocalPlayer != null)
                酒狐图鉴UI.Open();
        }
    }

    //===== 供非配置上下文（如建筑预览）直接读取当前值 =====
    public static int 取搭平台长度() => ModContent.GetInstance<酒狐任务配置>().搭平台最大长度;
    public static int 取搭平台间距() => ModContent.GetInstance<酒狐任务配置>().搭平台垂直间距;
    public static int 取搭平台层数() => ModContent.GetInstance<酒狐任务配置>().搭平台堆叠次数;
    public static bool 拾取开关() => ModContent.GetInstance<酒狐任务配置>().酒狐拾取钱币星星;
    //外观：是否使用新皮肤（默认 false = 原皮肤）
    public static bool 取新皮肤() => ModContent.GetInstance<酒狐任务配置>().使用新皮肤;
}
