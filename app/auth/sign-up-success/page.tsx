import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, Mail } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">策略大师</span>
          </div>
          <div className="flex justify-center my-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">注册成功</CardTitle>
          <CardDescription>请查收验证邮件</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            我们已向您的邮箱发送了一封验证邮件。
            请点击邮件中的链接来激活您的账户。
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/auth/login">返回登录</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
