using Microsoft.Xna.Framework;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>酒狐聊天命令：/酒狐 确认  或  /酒狐 拒绝 —— 用于确认/拒绝酒狐的建造任务请求。</summary>
public sealed class 酒狐命令 : ModCommand
{
    public override string Command => "酒狐";
    public override CommandType Type => CommandType.Chat;
    public override string Usage => "/酒狐 确认 或 /酒狐 拒绝";
    public override string Description => "确认或拒绝酒狐的建造任务请求（造房纸/搭平台）";

    public override void Action(CommandCaller caller, string input, string[] args)
    {
        if (args.Length < 1)
        {
            caller.Reply("用法：" + Usage, new Color(255, 200, 120));
            return;
        }
        string a = args[0].Trim().ToLowerInvariant();
        if (a == "确认" || a == "confirm" || a == "是" || a == "y" || a == "yes")
            酒狐任务执行.确认建造(caller.Player);
        else if (a == "拒绝" || a == "deny" || a == "否" || a == "n" || a == "no" || a == "取消" || a == "cancel")
            酒狐任务执行.拒绝建造(caller.Player);
        else
            caller.Reply("用法：" + Usage, new Color(255, 200, 120));
    }
}
