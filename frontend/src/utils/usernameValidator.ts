/**
 * 用户名验证工具
 * 集中管理所有用户名验证规则
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class UsernameValidator {
  // 禁用的内容列表
  private static readonly FORBIDDEN_CONTENT = ["ek"];

  // 禁用的特殊字符
  private static readonly FORBIDDEN_CHARS = /[<>"'&]/;

  // 最小长度
  private static readonly MIN_LENGTH = 2;

  // 最大长度
  private static readonly MAX_LENGTH = 20;

  /**
   * 验证用户名是否符合所有规则
   * @param username 用户名
   * @returns 验证结果
   */
  static validate(username: string): ValidationResult {
    // 检查是否为空
    if (!username || !username.trim()) {
      return {
        isValid: false,
        error: "用户名不能为空",
      };
    }

    const trimmedUsername = username.trim();

    // 检查长度
    if (trimmedUsername.length < UsernameValidator.MIN_LENGTH) {
      return {
        isValid: false,
        error: `用户名至少需要${UsernameValidator.MIN_LENGTH}个字符`,
      };
    }

    if (trimmedUsername.length > UsernameValidator.MAX_LENGTH) {
      return {
        isValid: false,
        error: `用户名不能超过${UsernameValidator.MAX_LENGTH}个字符`,
      };
    }

    // 检查禁用内容
    for (const forbidden of UsernameValidator.FORBIDDEN_CONTENT) {
      if (trimmedUsername.toLowerCase().includes(forbidden.toLowerCase())) {
        return {
          isValid: false,
          error: `用户名包含禁用内容"${forbidden}"，请选择其他用户名`,
        };
      }
    }

    // 检查特殊字符
    if (UsernameValidator.FORBIDDEN_CHARS.test(trimmedUsername)) {
      return {
        isValid: false,
        error: "用户名不能包含特殊字符 < > \" ' &",
      };
    }

    return {
      isValid: true,
    };
  }

  /**
   * 简单验证函数，只返回是否有效
   * @param username 用户名
   * @returns 是否有效
   */
  static isValid(username: string): boolean {
    return UsernameValidator.validate(username).isValid;
  }

  /**
   * 获取错误信息
   * @param username 用户名
   * @returns 错误信息，如果有效则返回null
   */
  static getError(username: string): string | null {
    const result = UsernameValidator.validate(username);
    return result.isValid ? null : result.error || null;
  }

  /**
   * 检查是否包含禁用内容
   * @param username 用户名
   * @returns 是否包含禁用内容
   */
  static containsForbiddenContent(username: string): boolean {
    const lowerUsername = username.toLowerCase();
    return UsernameValidator.FORBIDDEN_CONTENT.some((forbidden) =>
      lowerUsername.includes(forbidden.toLowerCase())
    );
  }
}

// 导出便捷函数
export const validateUsername = UsernameValidator.validate;
export const isValidUsername = UsernameValidator.isValid;
export const getUsernameError = UsernameValidator.getError;
